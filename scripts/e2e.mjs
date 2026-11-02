// CLI-driven browser regression. Always starts its own server and disposable data.
import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules/.bin/playwright-cli");
const session = `obrazownik-test-${process.pid}`;
const data = mkdtempSync(path.join(tmpdir(), "obrazownik-e2e-"));
let server;
function run(args, marker) {
  const output = execFileSync(cli, [`-s=${session}`, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 50_000,
  });
  writeFileSync(
    path.join(root, "output/playwright", `${args[0]}-result.txt`),
    output,
  );
  if (
    output.includes("### Error") ||
    (marker && !output.includes(`### Result\n"${marker}"`))
  )
    throw new Error(output);
  return output;
}
async function start() {
  server = spawn(process.execPath, ["dist/server/server/index.js"], {
    cwd: root,
    env: { ...process.env, OBRAZOWNIK_DATA_DIR: data },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      const response = await fetch("http://127.0.0.1:4317/api/health");
      if (response.ok) {
        const boot = await (
          await fetch("http://127.0.0.1:4317/api/bootstrap")
        ).json();
        if (boot.dataDir !== realpathSync(data))
          throw new Error(
            "Test refused a server using another data directory.",
          );
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Test refused"))
        throw error;
    }
    await delay(100);
  }
  throw new Error(`Server startup timed out: ${output}`);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await exited;
  server = undefined;
}
try {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () =>
      reject(
        new Error(
          "Port 4317 jest zajęty. Zatrzymaj lokalny serwer przed npm run test:e2e. Nie zamknięto żadnego procesu.",
        ),
      ),
    );
    probe.listen(4317, "127.0.0.1", () => probe.close(resolve));
  });
  mkdirSync(path.join(root, "output/playwright"), { recursive: true });
  await start();
  run(["open", "http://127.0.0.1:4317"]);
  run(["snapshot"]);
  run(["run-code", "--filename", "tests/e2e/core.js"], "BEFORE_RELOAD_PASS");
  const navigation = run(["reload"]);
  if (navigation.includes("### Modal state")) run(["dialog-accept"]);
  run(["snapshot"]);
  run(["run-code", "--filename", "tests/e2e/recovery.js"], "CORE_PASS");
  console.log(
    "PASS: browser → autosave → hints → final; rescue after reload; two-tab conflict; lost hint response.",
  );
  await stop();
  await start();
  run(["reload"]);
  run(["snapshot"]);
  run(["run-code", "--filename", "tests/e2e/restart.js"], "RESTART_PASS");
  console.log(
    "PASS: server restart preserves text, final and help; session/CSRF reconnects.",
  );
} catch (error) {
  try {
    console.error(run(["snapshot"]));
    run([
      "screenshot",
      "--filename",
      "output/playwright/e2e-failure.png",
      "--full-page",
    ]);
  } catch {
    /* Preserve the original failure. */
  }
  throw error;
} finally {
  try {
    run(["close"]);
  } catch {
    /* No user browser session is affected. */
  }
  await stop();
  rmSync(data, { recursive: true, force: true });
}
