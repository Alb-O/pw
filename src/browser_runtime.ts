import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STANDARD_PLAYWRIGHT_BROWSERS = new Set([
	"chrome",
	"chrome-beta",
	"chrome-canary",
	"chrome-dev",
	"chromium",
	"msedge",
	"msedge-beta",
	"msedge-canary",
	"msedge-dev",
	"firefox",
	"webkit",
]);

const CHROMIUM_BROWSER_CANDIDATES = new Map<string, readonly string[]>([
	["arc", ["arc"]],
	["brave", ["brave-browser", "brave", "brave-browser-stable"]],
	["chrome", ["google-chrome", "google-chrome-stable", "chrome"]],
	["chromium", ["chromium", "chromium-browser"]],
	["edge", ["microsoft-edge", "microsoft-edge-stable", "msedge"]],
	["helium", ["helium-browser", "helium"]],
	["opera", ["opera", "opera-stable"]],
	["ungoogled-chromium", ["ungoogled-chromium"]],
	["vivaldi", ["vivaldi", "vivaldi-stable"]],
]);

type BrowserConfig = {
	browser?: {
		browserName?: string;
		isolated?: boolean;
		launchOptions?: {
			args?: unknown;
			executablePath?: string;
		};
	};
};

const defaultCliConfigPath = (): string =>
	path.resolve(".playwright", "cli.config.json");

const findOptionValue = (
	argv: readonly string[],
	flag: string,
): string | undefined => {
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === flag) {
			const next = argv[index + 1];
			return next?.startsWith("--") ? undefined : next;
		}
		if (arg.startsWith(`${flag}=`)) {
			return arg.slice(flag.length + 1);
		}
	}
	return undefined;
};

const replaceOptionValue = (
	argv: readonly string[],
	flag: string,
	value: string,
): string[] => {
	const nextArgv = [...argv];
	for (let index = 0; index < nextArgv.length; index++) {
		const arg = nextArgv[index];
		if (arg === flag) {
			if (index + 1 >= nextArgv.length || nextArgv[index + 1].startsWith("--")) {
				nextArgv.splice(index + 1, 0, value);
			} else {
				nextArgv[index + 1] = value;
			}
			return nextArgv;
		}
		if (arg.startsWith(`${flag}=`)) {
			nextArgv[index] = `${flag}=${value}`;
			return nextArgv;
		}
	}
	nextArgv.push(flag, value);
	return nextArgv;
};

const fileExists = (targetPath: string | undefined): targetPath is string =>
	typeof targetPath === "string" && fs.existsSync(targetPath);

const isLikelyChromiumExecutable = (targetPath: string): boolean => {
	const baseName = path.basename(targetPath).toLowerCase();
	return [
		"arc",
		"brave",
		"chrome",
		"chromium",
		"edge",
		"helium",
		"opera",
		"vivaldi",
	].some((token) => baseName.includes(token));
};

const resolveOnPath = (binaryName: string): string | undefined => {
	const pathEnv = process.env.PATH;
	if (!pathEnv) {
		return undefined;
	}

	for (const directory of pathEnv.split(path.delimiter)) {
		if (!directory) {
			continue;
		}
		const candidate = path.join(directory, binaryName);
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
};

const desktopSearchDirs = (): string[] => {
	const dirs = new Set<string>();
	const xdgDataHome =
		process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
	dirs.add(path.join(xdgDataHome, "applications"));

	const xdgDataDirs = process.env.XDG_DATA_DIRS?.split(":") ?? [
		"/usr/local/share",
		"/usr/share",
	];
	for (const baseDir of xdgDataDirs) {
		if (baseDir) {
			dirs.add(path.join(baseDir, "applications"));
		}
	}

	if (process.env.USER) {
		dirs.add(
			path.join("/etc/profiles/per-user", process.env.USER, "share", "applications"),
		);
	}
	dirs.add("/run/current-system/sw/share/applications");

	return [...dirs];
};

const findDesktopEntry = (desktopId: string): string | undefined => {
	for (const directory of desktopSearchDirs()) {
		const candidate = path.join(directory, desktopId);
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
};

const tokenizeExec = (execValue: string): string[] =>
	execValue.match(/"[^"]*"|'[^']*'|\\.|[^\s]+/g)?.map((token) => {
		if (
			(token.startsWith('"') && token.endsWith('"')) ||
			(token.startsWith("'") && token.endsWith("'"))
		) {
			return token.slice(1, -1);
		}
		return token.replaceAll("\\ ", " ");
	}) ?? [];

const parseDesktopExec = (desktopFilePath: string): string | undefined => {
	const contents = fs.readFileSync(desktopFilePath, "utf8");
	const execLine = contents
		.split(/\r?\n/u)
		.find((line) => line.startsWith("Exec="));

	if (!execLine) {
		return undefined;
	}

	const tokens = tokenizeExec(execLine.slice("Exec=".length)).filter(
		(token) => !token.startsWith("%"),
	);
	const command = tokens[0];
	if (!command) {
		return undefined;
	}

	if (path.isAbsolute(command) && fs.existsSync(command)) {
		return command;
	}

	return resolveOnPath(command);
};

const resolveDesktopBrowser = (desktopId: string): string | undefined => {
	const entryPath = findDesktopEntry(desktopId);
	if (!entryPath) {
		return undefined;
	}
	return parseDesktopExec(entryPath);
};

const resolveChromiumBrowserExecutable = (
	browser: string,
): string | undefined => {
	if (!browser) {
		return undefined;
	}

	if (path.isAbsolute(browser) && fs.existsSync(browser)) {
		return browser;
	}

	if (browser.endsWith(".desktop")) {
		return resolveDesktopBrowser(browser);
	}

	const normalized = browser.toLowerCase();
	const aliasCandidates =
		CHROMIUM_BROWSER_CANDIDATES.get(normalized) ??
		CHROMIUM_BROWSER_CANDIDATES.get(normalized.replace(/\.desktop$/u, ""));
	if (aliasCandidates) {
		for (const candidate of aliasCandidates) {
			const resolved = resolveOnPath(candidate);
			if (resolved) {
				return resolved;
			}
		}
	}

	return resolveOnPath(browser);
};

const defaultDesktopBrowser = (): string | undefined => {
	try {
		const result = childProcess.execFileSync(
			"xdg-settings",
			["get", "default-web-browser"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		).trim();
		return result || undefined;
	} catch {
		return undefined;
	}
};

const resolveDefaultChromiumExecutable = (): string | undefined => {
	const desktopBrowser = defaultDesktopBrowser();
	if (!desktopBrowser) {
		return undefined;
	}

	const resolved = resolveChromiumBrowserExecutable(desktopBrowser);
	if (!resolved || !isLikelyChromiumExecutable(resolved)) {
		return undefined;
	}

	return resolved;
};

const loadJsonConfig = (configPath: string): BrowserConfig => {
	try {
		const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
		if (parsed && typeof parsed === "object") {
			return parsed as BrowserConfig;
		}
	} catch {
	}
	return {};
};

const makeInjectedConfig = (
	baseConfig: BrowserConfig,
	executablePath: string,
): BrowserConfig => {
	const currentLaunchOptions = baseConfig.browser?.launchOptions ?? {};
	const currentArgs = Array.isArray(currentLaunchOptions.args)
		? currentLaunchOptions.args.filter((value): value is string => typeof value === "string")
		: [];
	const args = currentArgs.includes("--remote-debugging-port=0")
		? currentArgs
		: [...currentArgs, "--remote-debugging-port=0"];

	return {
		...baseConfig,
		browser: {
			...baseConfig.browser,
			browserName: "chromium",
			isolated: false,
			launchOptions: {
				...currentLaunchOptions,
				executablePath,
				args,
			},
		},
	};
};

const installInjectedConfig = (
	executablePath: string,
	baseConfigPath?: string,
): void => {
	const baseConfig =
		baseConfigPath && fs.existsSync(baseConfigPath)
			? loadJsonConfig(baseConfigPath)
			: {};
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-cli-config-"));
	const tempConfigPath = path.join(tempDir, "cli.config.json");
	const injectedConfig = makeInjectedConfig(baseConfig, executablePath);
	fs.writeFileSync(tempConfigPath, JSON.stringify(injectedConfig, null, 2));
	process.env.PLAYWRIGHT_MCP_CONFIG = tempConfigPath;
	process.on("exit", () => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});
};

const explicitConfigPath = (argv: readonly string[]): string | undefined =>
	findOptionValue(argv, "--config") ??
	process.env.PLAYWRIGHT_MCP_CONFIG ??
	(fs.existsSync(defaultCliConfigPath()) ? defaultCliConfigPath() : undefined);

const shouldInjectDefaultBrowser = (argv: readonly string[]): boolean =>
	findOptionValue(argv, "--browser") === undefined &&
	process.env.PLAYWRIGHT_MCP_BROWSER === undefined &&
	process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH === undefined &&
	process.env.PW_BROWSER_EXECUTABLE_PATH === undefined &&
	explicitConfigPath(argv) === undefined;

const configureCustomChromiumBrowser = (argv: readonly string[]): string[] => {
	const configuredExecutable =
		process.env.PW_BROWSER_EXECUTABLE_PATH ??
		process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH;
	if (fileExists(configuredExecutable)) {
		process.env.PLAYWRIGHT_MCP_BROWSER = "chromium";
		process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH = configuredExecutable;
		if (!explicitConfigPath(argv)) {
			installInjectedConfig(configuredExecutable);
		}
		return [...argv];
	}

	const requestedBrowser = findOptionValue(argv, "--browser");
	if (!requestedBrowser || STANDARD_PLAYWRIGHT_BROWSERS.has(requestedBrowser)) {
		return [...argv];
	}

	const executablePath = resolveChromiumBrowserExecutable(requestedBrowser);
	if (!fileExists(executablePath)) {
		throw new Error(
			`unsupported browser '${requestedBrowser}'; pass a Chromium-family executable path or install a browser such as brave or helium`,
		);
	}

	process.env.PLAYWRIGHT_MCP_BROWSER = "chromium";
	process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH = executablePath;
	if (!explicitConfigPath(argv)) {
		installInjectedConfig(executablePath);
	}
	return replaceOptionValue(argv, "--browser", "chromium");
};

const configureDefaultChromiumBrowser = (argv: readonly string[]): void => {
	if (!shouldInjectDefaultBrowser(argv)) {
		return;
	}

	const executablePath = resolveDefaultChromiumExecutable();
	if (!fileExists(executablePath)) {
		return;
	}

	process.env.PLAYWRIGHT_MCP_BROWSER = "chromium";
	process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH = executablePath;
	installInjectedConfig(executablePath);
};

const configurePlaywrightBrowserRuntime = (
	argv: readonly string[],
): string[] => {
	const nextArgv = configureCustomChromiumBrowser(argv);
	configureDefaultChromiumBrowser(nextArgv);
	return nextArgv;
};

export { configurePlaywrightBrowserRuntime };
