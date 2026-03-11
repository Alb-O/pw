# pw

Thin wrapper around Playwright's internal client CLI entrypoint,
`playwright/lib/cli/client/program`.

The current goal is narrow:

- make that internal CLI reachable from a normal repo-local `bin`
- keep the wrapper buildable from a Nix `buildNpmPackage` flow
- preserve the upstream command surface such as `open`, `snapshot`, `click`,
  `type`, and `dblclick`

The repo also exposes a reusable packaged runtime through devenv/Nix:

- `pw-core`: built package root with `dist/` and bundled `node_modules`
- `pw-cli`: runnable wrapper binary

Browser behavior:

- if no explicit browser/config is provided, `pw-cli` will try to use the
  system default Chromium-family browser on Linux
- custom Chromium browsers such as `brave` and `helium` can be selected with
  `--browser brave`, `--browser helium`, or `PW_BROWSER_EXECUTABLE_PATH=/path/to/browser`
- when `pw-cli` injects the browser launch config itself, it adds
  `--remote-debugging-port=0`

This is intentionally coupled to a specific Playwright package version. If the
internal `playwright/lib/cli/client/program` path changes upstream, this repo
will need to move with it.

Run locally:

```bash
devenv shell -- bash -lc 'npm install && npm run build && pw-cli --help'
```
