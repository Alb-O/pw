import fs from "node:fs";
import path from "node:path";
import { configurePlaywrightBrowserRuntime } from "./browser_runtime";

const defaultBasePath = (): string => path.resolve(__dirname, "..");

const readPackageName = (packageRoot: string): string | undefined => {
	const packageJsonPath = path.join(packageRoot, "package.json");
	if (!fs.existsSync(packageJsonPath)) {
		return undefined;
	}

	const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
		name?: string;
	};
	return parsed.name;
};

const resolvePlaywrightPackageRoot = (basePath?: string): string => {
	const resolvedBasePath = path.resolve(basePath ?? defaultBasePath());
	const directPackageName = readPackageName(resolvedBasePath);

	if (directPackageName === "playwright") {
		return resolvedBasePath;
	}

	const bundledPlaywright = path.join(
		resolvedBasePath,
		"node_modules",
		"playwright",
	);
	if (fs.existsSync(path.join(bundledPlaywright, "package.json"))) {
		return bundledPlaywright;
	}

	const resolvedPackageJson = require.resolve("playwright/package.json", {
		paths: [resolvedBasePath],
	});
	return path.dirname(resolvedPackageJson);
};

const resolvePlaywrightClientHelpPath = (basePath?: string): string =>
	path.join(resolvePlaywrightPackageRoot(basePath), "lib/cli/client/help.json");

const resolvePlaywrightClientProgramPath = (basePath?: string): string =>
	path.join(resolvePlaywrightPackageRoot(basePath), "lib/cli/client/program.js");

const patchPlaywrightClientHelpBinName = (
	binName: string,
	basePath?: string,
): void => {
	const help = require(resolvePlaywrightClientHelpPath(basePath)) as {
		global?: string;
		commands?: Record<string, string>;
	};

	if (typeof help.global === "string") {
		help.global = help.global.replaceAll("playwright-cli", binName);
	}

	if (help.commands !== undefined) {
		for (const [command, text] of Object.entries(help.commands)) {
			help.commands[command] = text.replaceAll("playwright-cli", binName);
		}
	}
};

const patchPlaywrightClientBanner = (binName: string): void => {
	const originalLog = console.log;

	console.log = (...args: unknown[]) => {
		if (
			args.length > 0 &&
			args[0] === "playwright-cli - run playwright mcp commands from terminal\n"
		) {
			args[0] = `${binName} - run playwright mcp commands from terminal\n`;
		}

		originalLog(...args);
	};
};

type PlaywrightChromium = {
	launch: (options: {
		executablePath?: string;
		headless?: boolean;
		args?: readonly string[];
	}) => Promise<unknown>;
};

const resolvePlaywrightChromium = (
	basePath?: string,
): PlaywrightChromium => {
	const playwrightPackageRoot = resolvePlaywrightPackageRoot(basePath);
	const loaded = require(playwrightPackageRoot) as {
		chromium?: PlaywrightChromium;
	};

	if (loaded.chromium === undefined) {
		throw new Error(
			`playwright chromium export missing in ${playwrightPackageRoot}`,
		);
	}

	return loaded.chromium;
};

const runPlaywrightClientProgram = (
	binName: string,
	basePath?: string,
): void => {
	process.argv = [
		process.argv[0],
		process.argv[1],
		...configurePlaywrightBrowserRuntime(process.argv.slice(2)),
	];
	patchPlaywrightClientHelpBinName(binName, basePath);
	patchPlaywrightClientBanner(binName);
	require(resolvePlaywrightClientProgramPath(basePath));
};

export {
	patchPlaywrightClientHelpBinName,
	resolvePlaywrightChromium,
	resolvePlaywrightClientHelpPath,
	resolvePlaywrightClientProgramPath,
	resolvePlaywrightPackageRoot,
	runPlaywrightClientProgram,
};
