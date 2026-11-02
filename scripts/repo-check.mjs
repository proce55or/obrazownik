#!/usr/bin/env node
// Path checks and a limited secret-pattern check; never prints file contents.
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const ownRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const blockedDirs = new Set([
  "private",
  "local-data",
  "obrazownik-dane",
  "backups",
  "exports",
  "logs",
  "models",
  "production-data",
  "user-data",
  "node_modules",
  "dist",
  "coverage",
  "output",
  ".playwright-cli",
  "playwright-report",
  "test-results",
]);
function pathProblem(name) {
  const parts = name.toLowerCase().split("/");
  const base = parts.at(-1);
  if (parts.some((part) => blockedDirs.has(part)))
    return "dane lokalne lub wynikowe nie należą do repo";
  if (
    /^\.env(?:\..*)?$/.test(base) &&
    name.split("/").at(-1) !== ".env.example"
  )
    return "plik środowiska lub sekretów";
  if (/\.(?:sqlite3?|db)(?:[-.].*)?$/i.test(base))
    return "baza lub plik pomocniczy bazy";
  if (
    /\.(?:gguf|safetensors|ckpt|onnx|pth|pem|key|p12|pfx|jks|keystore)$/i.test(
      base,
    )
  )
    return "model lub materiał klucza";
  if (/^(?:credentials|secrets?)(?:\.[^.]+)?$/i.test(base))
    return "plik poświadczeń";
  return undefined;
}
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{24,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
];
function contentProblem(name, bytes) {
  if (bytes.length > 1024 * 1024 || bytes.includes(0)) return undefined;
  const text = bytes.toString("utf8");
  if (secretPatterns.some((pattern) => pattern.test(text)))
    return "wzorzec sekretu lub klucza prywatnego";
  if (path.basename(name) === ".env.example") {
    const nonempty = text
      .split(/\r?\n/)
      .some(
        (line) =>
          line.trim() &&
          !line.trim().startsWith("#") &&
          !/^[A-Za-z_][A-Za-z0-9_]*=(?:""|'')?$/.test(line.trim()),
      );
    if (nonempty)
      return ".env.example może zawierać tylko puste ustawienia i komentarze";
  }
  return undefined;
}
export function checkRepository(root = ownRoot) {
  root = realpathSync(root);
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const tracked = git(["ls-files", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const staged = git([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMRT",
    "-z",
  ])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const index = git(["ls-files", "--stage", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const modes = new Map(
    index.map((entry) => {
      const match = entry.match(/^(\d+) [a-f0-9]+ \d\t([\s\S]+)$/);
      return match ? [match[2], match[1]] : [entry, "unknown"];
    }),
  );
  const errors = [];
  for (const name of new Set([...tracked, ...staged])) {
    const problem = pathProblem(name);
    if (problem) {
      errors.push(`${name}: ${problem}`);
      continue;
    }
    if (modes.get(name) === "120000") {
      errors.push(`${name}: dowiązania nie należą do repo`);
      continue;
    }
    try {
      let current = root;
      let linked = false;
      for (const part of name.split("/")) {
        current = path.join(current, part);
        try {
          if (lstatSync(current).isSymbolicLink()) {
            linked = true;
            break;
          }
        } catch (error) {
          if (error.code === "ENOENT") break;
          throw error;
        }
      }
      if (linked) {
        errors.push(`${name}: dowiązanie w ścieżce roboczej`);
        continue;
      }
      const stat = lstatSync(path.join(root, name));
      if (stat.isSymbolicLink()) {
        errors.push(`${name}: dowiązanie w drzewie roboczym`);
        continue;
      }
      if (stat.isFile() && stat.size <= 1024 * 1024) {
        const local = contentProblem(name, readFileSync(path.join(root, name)));
        if (local) errors.push(`${name}: ${local} (plik roboczy)`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const size = Number(
      git(["cat-file", "-s", `:${name}`])
        .toString("utf8")
        .trim(),
    );
    const stagedContent =
      size <= 1024 * 1024
        ? contentProblem(name, git(["show", `:${name}`]))
        : undefined;
    if (stagedContent) errors.push(`${name}: ${stagedContent} (indeks Git)`);
  }
  return {
    status: errors.length ? "FAIL" : "PASS",
    tracked: tracked.length,
    staged: staged.length,
    errors,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 2 && args[0] === "--root"))
      throw new Error("Użycie: node scripts/repo-check.mjs [--root DIR]");
    const result = checkRepository(
      args.length ? path.resolve(args[1]) : ownRoot,
    );
    if (result.errors.length) {
      for (const error of result.errors) console.error(`REPO_FAIL: ${error}`);
      process.exitCode = 1;
    } else console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Nie udało się sprawdzić repo.",
    );
    process.exitCode = 1;
  }
}
