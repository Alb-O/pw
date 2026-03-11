{ pkgs, ... }:

let
  shared = import ./shared.nix { inherit pkgs; };
in
{
  outputs = {
    pw-cli = shared.pwCli;
    pw-cli-built = shared.workspaceCli;
  };
}
