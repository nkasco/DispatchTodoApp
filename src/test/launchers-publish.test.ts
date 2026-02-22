import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const psLauncherPath = path.join(repoRoot, "scripts", "launchers", "dispatch-dev.ps1");
const shLauncherPath = path.join(repoRoot, "scripts", "launchers", "dispatch-dev.sh");

function readLauncher(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

describe("dispatch-dev launcher publish flow (multi-arch)", () => {
  it("includes PowerShell ARM publish with Buildx/QEMU and builder override", () => {
    const script = readLauncher(psLauncherPath);

    expect(script).toContain("function Get-ArmImageTag");
    expect(script).toContain("function Ensure-BuildxBuilder");
    expect(script).toContain("docker run --privileged --rm tonistiigi/binfmt --install arm64");
    expect(script).toContain("docker buildx build --platform linux/arm64 --file Dockerfile --tag $armImage --push .");
    expect(script).toContain("DISPATCH_BUILDX_BUILDER");
    expect(script).toContain('return "${repo}:$tag-arm64"');
    expect(script).toContain("[4/4]");
  });

  it("includes shell ARM publish with Buildx/QEMU and builder override", () => {
    const script = readLauncher(shLauncherPath);

    expect(script).toContain("derive_arm_image_tag()");
    expect(script).toContain("ensure_buildx_builder()");
    expect(script).toContain("docker run --privileged --rm tonistiigi/binfmt --install arm64");
    expect(script).toContain('docker buildx build --platform linux/arm64 --file Dockerfile --tag "$arm_image" --push .');
    expect(script).toContain("DISPATCH_BUILDX_BUILDER");
    expect(script).toContain('printf "%s:%s-arm64" "$repo" "$tag"');
    expect(script).toContain("[4/4]");
  });
});

