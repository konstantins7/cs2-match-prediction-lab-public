import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ReleaseBump = "patch" | "minor" | "major";

export async function planRelease(input: { bump: ReleaseBump; dryRun?: boolean; push?: boolean; githubRelease?: boolean }) {
  const root = process.cwd();
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { version: string };
  const nextVersion = bumpVersion(pkg.version, input.bump);
  const checks: string[] = [];
  checks.push(await git("status", ["status", "--short"]));
  const changelog = await draftChangelog(nextVersion);
  if (!input.dryRun) {
    pkg.version = nextVersion;
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    await prependChangelog(nextVersion, changelog);
    await git("add", ["add", "package.json", "CHANGELOG.md"]);
    await git("commit", ["commit", "-m", `chore: release v${nextVersion}`]);
    await git("tag", ["tag", "-a", `v${nextVersion}`, "-m", `Release v${nextVersion}`]);
    if (input.push) await git("push", ["push", "public", "HEAD", `v${nextVersion}`]);
    if (input.githubRelease) await execFileAsync("gh", ["release", "create", `v${nextVersion}`, "--title", `v${nextVersion}`, "--notes", changelog], { windowsHide: true });
  }
  return {
    ok: true,
    currentVersion: pkg.version,
    nextVersion,
    dryRun: Boolean(input.dryRun),
    checks,
    changelog
  };
}

export function bumpVersion(version: string, bump: ReleaseBump) {
  const [major, minor, patch] = version.split(".").map((part) => Number(part));
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

async function draftChangelog(version: string) {
  const raw = await git("log", ["log", "--pretty=format:%s", "-n", "50"]).catch(() => "");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const grouped = lines.reduce<Record<string, string[]>>((acc, line) => {
    const prefix = line.match(/^(\w+)(?:\(.+\))?:\s*(.+)$/);
    const key = prefix?.[1] ?? "changes";
    const text = prefix?.[2] ?? line;
    acc[key] = acc[key] ?? [];
    acc[key].push(text);
    return acc;
  }, {});
  const sections = Object.entries(grouped).map(([key, items]) => `### ${key}\n${items.slice(0, 12).map((item) => `- ${item}`).join("\n")}`).join("\n\n");
  return `## v${version}\n\n${sections || "- Maintenance release."}\n`;
}

async function prependChangelog(version: string, entry: string) {
  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  const current = await readFile(changelogPath, "utf8").catch(() => "# Changelog\n\n");
  if (current.includes(`## v${version}`)) return;
  await writeFile(changelogPath, current.replace(/^# Changelog\s*/i, `# Changelog\n\n${entry}\n`), "utf8");
}

async function git(name: string, args: string[]) {
  const result = await execFileAsync(resolveGit(), args, { timeout: 120_000, windowsHide: true });
  return `${name}: ${(result.stdout || result.stderr).trim()}`;
}

function resolveGit() {
  if (process.env.GIT_EXE && existsSync(process.env.GIT_EXE)) return process.env.GIT_EXE;
  const candidates = [
    "C:\\Users\\k.saldin\\AppData\\Local\\GitHubDesktop\\app-3.5.8\\resources\\app\\git\\cmd\\git.exe",
    "C:\\Program Files\\Git\\cmd\\git.exe",
    "C:\\Program Files\\Git\\bin\\git.exe"
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? "git";
}
