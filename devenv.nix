{ lib, ... }:

{
  imports = [ ./nix ];

  composer.ownInstructions =
    let
      currentProject = builtins.baseNameOf (toString ./.);
    in
    lib.optionalAttrs (builtins.pathExists ./AGENTS.md) {
      "${currentProject}" = [ (builtins.readFile ./AGENTS.md) ];
    };
}
