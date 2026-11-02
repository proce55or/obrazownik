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
const port=Number(process.env.OBRAZOWNIK_TEST_PORT??4318);
const origin=`http://127.0.0.1:${port}`;
let server;
function run(args, marker, timeout = 50_000) {
  const output = execFileSync(cli, [`-s=${session}`, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout,
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
    env: { ...process.env, OBRAZOWNIK_DATA_DIR: data, OBRAZOWNIK_PORT:String(port) },
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
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) {
        const boot = await (
          await fetch(`${origin}/api/bootstrap`)
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
          "Port testowy jest zajęty. Zatrzymaj lokalny serwer przed npm run test:e2e. Nie zamknięto żadnego procesu.",
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
  mkdirSync(path.join(root, "output/playwright"), { recursive: true });
  await start();
  run(["open", origin]);
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
  run(["run-code","--filename","tests/e2e/science.js"],"SCIENCE_PASS");
  console.log("PASS: Polish verb fields, snapshots, provenance and independent-to-assisted writing.");
  run(["run-code","--filename","tests/e2e/product.js"],"PRODUCT_PASS");
  console.log("PASS: own document → E5, all exercise families, settings, backup, JSON export/import, comparison and session.");
  run(["run-code","--filename","tests/e2e/readability.js"],"READABILITY_PASS");
  console.log("PASS: two cards per family, optional variants, 320/390px, 200% CSS zoom and keyboard focus.");
  if(process.env.OBRAZOWNIK_TEST_LLM==='1') {
    console.log('Optional Bielik QA: allow up to180s for background preparation; keep writing and model disclosure separate.');
    run(["run-code","--filename","tests/e2e/local-model.js"],"LOCAL_MODEL_PASS",240_000);
    console.log('PASS: local question buffer, explicit disclosure, model provenance, off mode and independent isolation.');
    run(["run-code","--filename","tests/e2e/local-model-buffer.js"],"LOCAL_MODEL_BUFFER_PASS",240_000);
    console.log('PASS: autosave completed while the local question was preparing; disclosure captured the latest text.');
  }
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
