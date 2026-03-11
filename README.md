# pw-cli

Thin wrapper around Playwright's internal client CLI entrypoint,
`playwright/lib/cli/client/program`.

The current goal is narrow:

- make that internal CLI reachable from a normal repo-local `bin`
- keep the wrapper buildable from a Nix `buildNpmPackage` flow
- preserve the upstream command surface such as `open`, `snapshot`, `click`,
  `type`, and `dblclick`

This is intentionally coupled to a specific Playwright package version. If the
internal `playwright/lib/cli/client/program` path changes upstream, this repo
will need to move with it.

Run locally:

```bash
devenv shell -- bash -lc 'npm install && npm run build && pw-cli --help'
```
