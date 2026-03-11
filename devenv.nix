{
  lib,
  pkgs,
  ...
}:

let
  shared = import ./nix/shared.nix { inherit pkgs; };
in

{
  imports = [ ./nix ];

  packages = [
    shared.node
    shared.pwCli
    pkgs.chromium
    pkgs.typescript
  ];

  scripts = {
    build.exec = lib.mkDefault "npm run build";
    check.exec = lib.mkDefault "npm run check";
    help.exec = lib.mkDefault "npm run help";
  };

  enterShell = ''
    echo "Run: npm install"
    echo "Run: check"
    echo "Run: build"
    echo "Run: help"
    echo "Run: pw-cli --help"
  '';

  enterTest = ''
    set -euo pipefail
    chromium --version
    node --version
    npm --version
    tsc --version
  '';

  composer.ownInstructions =
    let
      currentProject = builtins.baseNameOf (toString ./.);
    in
    lib.optionalAttrs (builtins.pathExists ./AGENTS.md) {
      "${currentProject}" = [ (builtins.readFile ./AGENTS.md) ];
    };
}
