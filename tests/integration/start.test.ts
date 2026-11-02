import { expect, test } from "vitest";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const project = fileURLToPath(new URL("../../", import.meta.url));
test("Mac launcher starts its own fixture from a path containing spaces with --no-open", async () => {
  if (process.platform !== "darwin") return;
  const base = mkdtempSync(path.join(tmpdir(), "obrazownik-launcher-"));
  const root = path.join(base, "project with spaces"),
    data = path.join(base, "data with spaces");
  let child: ReturnType<typeof spawn> | undefined;
  let exited: Promise<number | null> | undefined;
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", reject);
      probe.listen(0, "127.0.0.1", () => {
        const address = probe.address();
        if (!address || typeof address === "string") {
          reject(new Error("No fixture port"));
          return;
        }
        probe.close(() => resolve(address.port));
      });
    });
    expect(port).not.toBe(4317);
    for (const dir of [
      "scripts",
      "dist/client",
      "dist/server/server",
      "dist/server/shared",
    ])
      mkdirSync(path.join(root, dir), { recursive: true });
    mkdirSync(data);
    copyFileSync(
      path.join(project, "scripts/start.mjs"),
      path.join(root, "scripts/start.mjs"),
    );
    copyFileSync(
      path.join(project, "Start-Obrazownik.command"),
      path.join(root, "Start-Obrazownik.command"),
    );
    chmodSync(path.join(root, "Start-Obrazownik.command"), 0o755);
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    writeFileSync(
      path.join(root, "dist/client/index.html"),
      "<!doctype html><title>Synthetic launcher fixture</title>",
    );
    writeFileSync(
      path.join(root, "dist/server/shared/config.js"),
      `export const HOST='127.0.0.1',PORT=${port},VERSION='fixture';`,
    );
    writeFileSync(
      path.join(root, "dist/server/server/paths.js"),
      "export const resolveDataDir = value => value;",
    );
    writeFileSync(
      path.join(root, "dist/server/server/index.js"),
      `
import http from 'node:http';
const server = http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/api/health'?{app:'obrazownik',status:'ok',version:'fixture'}:{dataDir:process.env.OBRAZOWNIK_DATA_DIR}));});
server.listen(${port},'127.0.0.1');
process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());
`,
    );
    child = spawn(path.join(root, "Start-Obrazownik.command"), ["--no-open"], {
      cwd: base,
      env: { ...process.env, OBRAZOWNIK_DATA_DIR: data },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const launched = child;
    let output = "";
    launched.stdout?.on("data", (value) => {
      output += value;
    });
    launched.stderr?.on("data", (value) => {
      output += value;
    });
    exited = new Promise((resolve) => launched.once("exit", resolve));
    for (let i = 0; i < 100 && !output.includes("Gotowe:"); i++) {
      if (launched.exitCode !== null) throw new Error(output);
      await delay(50);
    }
    expect(output).toContain(`Gotowe: http://127.0.0.1:${port}`);
    const response = await fetch(`http://127.0.0.1:${port}/api/bootstrap`, {
      headers: { Connection: "close" },
    });
    expect(await response.json()).toEqual({ dataDir: data });
    launched.kill("SIGTERM");
    expect(
      await Promise.race([exited, delay(3000).then(() => "timeout")]),
    ).toBe(0);
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      if (exited) await exited;
    }
    rmSync(base, { recursive: true, force: true });
  }
}, 10_000);
