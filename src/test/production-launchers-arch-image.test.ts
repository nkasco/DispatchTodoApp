import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const psLauncherPath = path.join(repoRoot, "dispatch.ps1");
const shLauncherPath = path.join(repoRoot, "dispatch.sh");

function readLauncher(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

describe("production launchers resolve image architecture", () => {
  it("PowerShell launcher resolves DISPATCH_IMAGE to host architecture", () => {
    const script = readLauncher(psLauncherPath);

    expect(script).toContain("function Get-DockerArchitecture");
    expect(script).toContain("function Resolve-DispatchImageForHost");
    expect(script).toContain("function Convert-ToArmImageTag");
    expect(script).toContain("function Test-IsDispatchImage");
    expect(script).toContain('docker version --format "{{.Server.Arch}}"');
    expect(script).toContain('return "${repo}:$tag-arm64"');
    expect(script).toContain("if (-not (Test-IsDispatchImage -Image $trimmedImage))");
    expect(script).toContain("$env:DISPATCH_IMAGE = $resolvedImage");
    expect(script).toContain("Image selection is architecture-aware (amd64/arm64).");
  });

  it("shell launcher resolves DISPATCH_IMAGE to host architecture", () => {
    const script = readLauncher(shLauncherPath);

    expect(script).toContain("get_docker_architecture()");
    expect(script).toContain("resolve_dispatch_image_for_host()");
    expect(script).toContain("convert_to_arm_image_tag()");
    expect(script).toContain("is_dispatch_image()");
    expect(script).toContain("docker version --format '{{.Server.Arch}}'");
    expect(script).toContain('printf "%s:%s-arm64" "$repo" "$tag"');
    expect(script).toContain('if ! is_dispatch_image "$image"; then');
    expect(script).toContain('DISPATCH_IMAGE="$resolved_image" docker compose --env-file "$ENV_FILE" "$@"');
    expect(script).toContain("Image selection is architecture-aware (amd64/arm64).");
  });
});
