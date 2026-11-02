import { expect, test } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const checker = fileURLToPath(
  new URL("../../scripts/repo-check.mjs", import.meta.url),
);
function git(root: string, args: string[]) {
  return execFileSync("git", args, { cwd: root, stdio: "pipe" });
}
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "obrazownik-repo-check-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.name", "Synthetic Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  return root;
}
function run(root: string) {
  return spawnSync(process.execPath, [checker, "--root", root], {
    encoding: "utf8",
  });
}

test("repo checker accepts neutral tracked/staged code including empty environment examples", () => {
  const root = fixture();
  try {
    mkdirSync(path.join(root, "source with space"));
    writeFileSync(
      path.join(root, "source with space/app.ts"),
      "export const answer = 42;\n",
    );
    writeFileSync(
      path.join(root, ".env.example"),
      "# Empty settings only\nOBRAZOWNIK_DATA_DIR=\n",
    );
    git(root, ["add", "source with space/app.ts", ".env.example"]);
    const result = run(root);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe("PASS");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repo checker rejects already tracked data and staged databases, models and secrets", () => {
  const root = fixture();
  try {
    mkdirSync(path.join(root, "private"));
    writeFileSync(
      path.join(root, "private/synthetic.txt"),
      "Syntetyczne dane.",
    );
    git(root, ["add", "private/synthetic.txt"]);
    git(root, ["commit", "-q", "-m", "Synthetic tracked data"]);
    for (const name of ["test.sqlite-wal", "weights.gguf", ".env.local"])
      writeFileSync(path.join(root, name), "synthetic");
    git(root, ["add", "test.sqlite-wal", "weights.gguf", ".env.local"]);
    const result = run(root);
    expect(result.status).toBe(1);
    for (const name of [
      "private/synthetic.txt",
      "test.sqlite-wal",
      "weights.gguf",
      ".env.local",
    ])
      expect(result.stderr).toContain(name);
    expect(result.stderr).not.toContain("Syntetyczne dane.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("staged secret content and index symlinks are detected even if the working file looks harmless", () => {
  const root = fixture();
  try {
    const header = ["-----BEGIN", "OPENSSH", "PRIVATE", "KEY-----"].join(" ");
    writeFileSync(path.join(root, "neutral.txt"), header);
    symlinkSync("missing-local-data", path.join(root, "innocent-link"));
    git(root, ["add", "neutral.txt", "innocent-link"]);
    writeFileSync(path.join(root, "neutral.txt"), "Harmless working file.");
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("neutral.txt");
    expect(result.stderr).toContain("indeks Git");
    expect(result.stderr).toContain("innocent-link");
    expect(result.stderr).not.toContain(header);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
