#!/usr/bin/env node

const path = require("node:path");

const BIN_NAME = "pw-cli";

type HelpDoc = {
  global?: string;
  commands?: Record<string, string>;
};

const patchHelpText = (): void => {
  const playwrightRoot = path.dirname(
    require.resolve("playwright/package.json"),
  );
  const helpPath = path.join(playwrightRoot, "lib/cli/client/help.json");
  const help = require(helpPath) as HelpDoc;

  if (typeof help.global === "string") {
    help.global = help.global.replaceAll("playwright-cli", BIN_NAME);
  }

  if (help.commands !== undefined) {
    for (const [command, text] of Object.entries(help.commands)) {
      help.commands[command] = text.replaceAll("playwright-cli", BIN_NAME);
    }
  }
};

const patchBannerText = (): void => {
  const originalLog = console.log;

  console.log = (...args: unknown[]) => {
    if (
      args.length > 0 &&
      args[0] === "playwright-cli - run playwright mcp commands from terminal\n"
    ) {
      args[0] = `${BIN_NAME} - run playwright mcp commands from terminal\n`;
    }

    originalLog(...args);
  };
};

patchHelpText();
patchBannerText();

const playwrightRoot = path.dirname(require.resolve("playwright/package.json"));
const programPath = path.join(playwrightRoot, "lib/cli/client/program.js");
require(programPath);
