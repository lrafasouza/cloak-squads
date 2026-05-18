#!/usr/bin/env node
/**
 * Wires .githooks/ as the canonical hooks directory for this clone.
 *
 * The .githooks/pre-commit script runs `gitleaks protect --staged` on every
 * commit, which is the only thing standing between a leaked keypair and the
 * 2026-04-29 demo-cofre incident repeating itself.
 *
 * Idempotent: re-running just re-points `core.hooksPath`.
 *
 * Skipped when:
 *   - not inside a git repository (e.g. when this repo is consumed as a
 *     tarball, CI cache restore, or pnpm install in a docker layer)
 *   - CI=true (the workflow runs gitleaks as its own job — local hook is
 *     a defence-in-depth for human commits, not CI machines)
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.CI === "true") {
  // CI has its own gitleaks job — skip the local-hook nudge.
  process.exit(0);
}

const repoRoot = resolve(import.meta.dirname, "..");
if (!existsSync(resolve(repoRoot, ".git"))) {
  // No git dir → likely a tarball/cache install. Nothing to wire.
  process.exit(0);
}

try {
  execSync("git config core.hooksPath .githooks", { cwd: repoRoot, stdio: "ignore" });
  console.log("[hooks] core.hooksPath → .githooks (pre-commit gitleaks scan enabled)");
} catch (err) {
  // Never block the install on a git config failure — just warn.
  console.warn("[hooks] could not set core.hooksPath:", err instanceof Error ? err.message : err);
}
