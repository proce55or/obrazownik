#!/usr/bin/env node
// Validate project context size. No packages, network or user-data access.
import {
  readdirSync,
  readFileSync,
  statSync,
  existsSync,
  lstatSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ownRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === "--root")) {
  console.error("Usage: node scripts/check-context.mjs [--root DIR]");
  process.exit(2);
}
const root = args.length ? path.resolve(args[1]) : ownRoot;
const KiB = 1024;
const limits = new Map([
  ["AGENTS.md", 3 * KiB],
  ["PROJECT.md", 2 * KiB],
  ["STATE.md", 3 * KiB],
  ["tasks/INDEX.md", 3 * KiB],
  ["docs/DECISIONS.md", 4 * KiB],
  ["START.md", 8 * KiB],
]);
const core = ["AGENTS.md", "PROJECT.md", "STATE.md", "tasks/INDEX.md"];
const skip = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  "tmp",
  "private",
  "local-data",
  "Obrazownik-dane",
  "backups",
  "exports",
  "logs",
  "models",
]);
const errors = [];
const md = new Map();
function visit(dir, relative = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = relative ? relative + "/" + entry.name : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (
        /\.(md|markdown)$/i.test(entry.name) ||
        /^(AGENTS|PROJECT|STATE|tasks|docs)$/i.test(entry.name)
      ) {
        errors.push(rel + ": symlink is not accepted for context files");
      }
      continue;
    }
    if (entry.isDirectory()) {
      if (!skip.has(entry.name)) visit(full, rel);
      continue;
    }
    if (!entry.isFile()) continue;
    if (
      /^(memory|handoff|summary|chat-history|conversation-history)\.(txt|json|ya?ml)$/i.test(
        entry.name,
      )
    ) {
      errors.push(
        rel + ": use the bounded Markdown context, not another memory store",
      );
    }
    if (!/\.(md|markdown)$/i.test(entry.name)) continue;
    const bytes = statSync(full).size;
    md.set(rel, bytes);
    const limit =
      limits.get(rel) ??
      (/^tasks\/T\d+\.md$/.test(rel)
        ? 5 * KiB
        : rel.startsWith("docs/")
          ? 16 * KiB
          : 8 * KiB);
    if (bytes > limit)
      errors.push(rel + ": " + bytes + " > " + limit + " bytes");
  }
}
try {
  visit(root);
  for (const f of core) {
    if (!md.has(f)) errors.push("Missing required context file: " + f);
  }
  const coreBytes = core.reduce((n, f) => n + (md.get(f) ?? 0), 0);
  const totalBytes = [...md.values()].reduce((a, b) => a + b, 0);
  if (coreBytes > 10 * KiB)
    errors.push("Core: " + coreBytes + " > 10240 bytes");
  if (totalBytes > 200 * KiB)
    errors.push("All Markdown: " + totalBytes + " > 204800 bytes");
  const statePath = path.join(root, "STATE.md");
  if (existsSync(statePath) && !lstatSync(statePath).isSymbolicLink()) {
    const state = readFileSync(statePath, "utf8");
    const active = state.match(/^Active task:\s*(T\d+)\s*$/m)?.[1];
    if (!active) errors.push("STATE.md: missing Active task: Txx");
    else if (!md.has("tasks/" + active + ".md"))
      errors.push("Missing active task card: " + active);
  }
  if (errors.length) {
    for (const error of errors) console.error("CONTEXT_FAIL: " + error);
    process.exitCode = 1;
  } else {
    console.log(
      JSON.stringify({
        status: "PASS",
        coreBytes,
        markdownBytes: totalBytes,
        markdownFiles: md.size,
      }),
    );
  }
} catch (error) {
  console.error("CONTEXT_FAIL: " + error.message);
  process.exitCode = 1;
}
