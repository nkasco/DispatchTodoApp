import { withAdminAuth, jsonResponse } from "@/lib/api";

const REPOSITORY_URL = "https://github.com/nkasco/DispatchTodoApp";
const README_BADGE_VERSION_URL = "https://img.shields.io/github/package-json/v/nkasco/DispatchTodoApp.json";
const PACKAGE_JSON_API_URL = "https://api.github.com/repos/nkasco/DispatchTodoApp/contents/package.json";

type VersionComparison = "up_to_date" | "behind" | "ahead" | "unknown";
type VersionSource = "package_json_badge" | "package_json" | "unknown";

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  preRelease: string[];
};

function extractVersion(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?/);
  return match ? match[0] : null;
}

function parseVersion(value: string): ParsedVersion | null {
  const normalized = value.trim();
  const [core, preRelease] = normalized.split("-", 2);
  const [major, minor, patch] = core.split(".");

  if (!major || !minor || !patch) return null;
  if (!/^\d+$/.test(major) || !/^\d+$/.test(minor) || !/^\d+$/.test(patch)) {
    return null;
  }

  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    preRelease: preRelease ? preRelease.split(".").filter((part) => part.length > 0) : [],
  };
}

function comparePreRelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const maxLength = Math.max(a.length, b.length);
  for (let i = 0; i < maxLength; i += 1) {
    const partA = a[i];
    const partB = b[i];
    if (partA === undefined && partB === undefined) return 0;
    if (partA === undefined) return -1;
    if (partB === undefined) return 1;
    if (partA === partB) continue;

    const numA = /^\d+$/.test(partA) ? Number(partA) : null;
    const numB = /^\d+$/.test(partB) ? Number(partB) : null;

    if (numA !== null && numB !== null) {
      return numA === numB ? 0 : numA > numB ? 1 : -1;
    }
    if (numA !== null && numB === null) return -1;
    if (numA === null && numB !== null) return 1;
    return partA > partB ? 1 : -1;
  }

  return 0;
}

function compareVersions(a: string, b: string): number | null {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  if (!parsedA || !parsedB) return null;

  if (parsedA.major !== parsedB.major) return parsedA.major > parsedB.major ? 1 : -1;
  if (parsedA.minor !== parsedB.minor) return parsedA.minor > parsedB.minor ? 1 : -1;
  if (parsedA.patch !== parsedB.patch) return parsedA.patch > parsedB.patch ? 1 : -1;
  return comparePreRelease(parsedA.preRelease, parsedB.preRelease);
}

function toComparison(runningVersion: string, latestVersion: string | null): VersionComparison {
  if (!latestVersion) return "unknown";
  const comparison = compareVersions(runningVersion, latestVersion);
  if (comparison === null) return "unknown";
  if (comparison === 0) return "up_to_date";
  if (comparison < 0) return "behind";
  return "ahead";
}

async function fetchLatestPublishedVersion(): Promise<{
  latestVersion: string | null;
  latestTag: string | null;
  latestReleaseUrl: string | null;
  publishedAt: string | null;
  source: VersionSource;
}> {
  const githubRequestInit: RequestInit = {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Dispatch-Version-Check",
    },
  };
  const badgeRequestInit: RequestInit = {
    cache: "no-store",
    headers: {
      "User-Agent": "Dispatch-Version-Check",
    },
  };

  const badgeResponse = await fetch(README_BADGE_VERSION_URL, badgeRequestInit);
  if (badgeResponse.ok) {
    const badgePayload = (await badgeResponse.json()) as {
      value?: string;
      message?: string;
    };
    const latestVersion = extractVersion(badgePayload.value ?? badgePayload.message ?? null);
    if (latestVersion) {
      return {
        latestVersion,
        latestTag: `v${latestVersion}`,
        latestReleaseUrl: REPOSITORY_URL,
        publishedAt: null,
        source: "package_json_badge",
      };
    }
  }

  const packageJsonResponse = await fetch(PACKAGE_JSON_API_URL, githubRequestInit);
  if (packageJsonResponse.ok) {
    const packageJsonPayload = (await packageJsonResponse.json()) as {
      content?: string;
      encoding?: string;
    };

    if (typeof packageJsonPayload.content === "string") {
      const raw =
        packageJsonPayload.encoding === "base64"
          ? Buffer.from(packageJsonPayload.content, "base64").toString("utf8")
          : packageJsonPayload.content;

      try {
        const parsed = JSON.parse(raw) as { version?: string };
        const latestVersion = extractVersion(parsed.version ?? null);
        if (latestVersion) {
          return {
            latestVersion,
            latestTag: `v${latestVersion}`,
            latestReleaseUrl: `${REPOSITORY_URL}/blob/main/package.json`,
            publishedAt: null,
            source: "package_json",
          };
        }
      } catch {
        // Continue to throw shared error below.
      }
    }
  }

  throw new Error("Unable to resolve repository package.json version from GitHub.");
}

/** GET /api/admin/version — compare current app version against latest GitHub release/tag (admin only) */
export const GET = withAdminAuth(async () => {
  const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  const runningVersion = extractVersion(rawVersion) ?? rawVersion;
  const checkedAt = new Date().toISOString();

  try {
    const latest = await fetchLatestPublishedVersion();
    return jsonResponse({
      repositoryUrl: REPOSITORY_URL,
      runningVersion,
      latestVersion: latest.latestVersion,
      latestTag: latest.latestTag,
      latestReleaseUrl: latest.latestReleaseUrl,
      publishedAt: latest.publishedAt,
      checkedAt,
      comparison: toComparison(runningVersion, latest.latestVersion),
      source: latest.source,
      error: null as string | null,
    });
  } catch (error) {
    return jsonResponse({
      repositoryUrl: REPOSITORY_URL,
      runningVersion,
      latestVersion: null as string | null,
      latestTag: null as string | null,
      latestReleaseUrl: null as string | null,
      publishedAt: null as string | null,
      checkedAt,
      comparison: "unknown" as VersionComparison,
      source: "unknown" as VersionSource,
      error: error instanceof Error ? error.message : "Version status check failed",
    });
  }
});
