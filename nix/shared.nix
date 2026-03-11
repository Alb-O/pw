{
  pkgs,
  ...
}:
let
  fs = pkgs.lib.fileset;
  node = pkgs.nodejs_22;
  workspaceRoot = ../.;

  workspaceSource = fs.toSource {
    root = workspaceRoot;
    fileset = fs.unions [
      (workspaceRoot + "/package.json")
      (workspaceRoot + "/package-lock.json")
      (workspaceRoot + "/tsconfig.json")
      (workspaceRoot + "/src")
    ];
  };

  workspaceCli = pkgs.buildNpmPackage {
    pname = "pw";
    version = "0.1.0";
    src = workspaceSource;
    nodejs = node;
    npmDeps = pkgs.importNpmLock {
      npmRoot = workspaceSource;
    };
    npmConfigHook = pkgs.importNpmLock.npmConfigHook;
    npmBuildScript = "build";
    doCheck = false;
    installPhase = ''
      runHook preInstall
      mkdir -p "$out"
      cp -R dist node_modules package.json package-lock.json "$out/"
      runHook postInstall
    '';
  };

  pwCli = pkgs.writeShellApplication {
    name = "pw-cli";
    runtimeInputs = [ node ];
    text = ''
      export NODE_PATH=${workspaceCli}/node_modules''${NODE_PATH:+:$NODE_PATH}
      exec node ${workspaceCli}/dist/cli.js "$@"
    '';
  };
in
{
  inherit
    node
    pwCli
    workspaceCli
    workspaceRoot
    ;
}
