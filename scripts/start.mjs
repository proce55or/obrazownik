#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
const ownRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function validateRuntime(version = process.versions.node) {
  if (!/^24\.21\.\d+$/.test(version))
    throw new Error(
      "Wymagany Node 24.21.x. Sprawdź .nvmrc; launcher niczego nie instaluje.",
    );
}
export async function inspectRunningServer({
  url,
  dataDir,
  version,
  fetchImpl = fetch,
}) {
  try {
    const options = {
      signal: globalThis.AbortSignal.timeout(1000),
      redirect: "error",
    };
    const response = await fetchImpl(`${url}/api/health`, options);
    if (!response.ok) return "occupied";
    const health = await response.json();
    if (
      health.app !== "obrazownik" ||
      health.status !== "ok" ||
      health.version !== version
    )
      return "occupied";
    const bootstrap = await fetchImpl(`${url}/api/bootstrap`, {
      signal: globalThis.AbortSignal.timeout(1000),
      redirect: "error",
    });
    if (!bootstrap.ok) return "occupied";
    const value = await bootstrap.json();
    return typeof value.dataDir === "string" && value.dataDir === dataDir
      ? "matching"
      : "occupied";
  } catch (error) {
    return error?.cause?.code === "ECONNREFUSED" ? "absent" : "occupied";
  }
}
async function openBrowser(url) {
  if (process.platform !== "darwin") {
    console.log(`Otwórz w przeglądarce: ${url}`);
    return;
  }
  await new Promise((resolve) => {
    const opener = spawn("open", [url], { stdio: "ignore" });
    opener.once("error", () => {
      console.log(`Otwórz w przeglądarce: ${url}`);
      resolve();
    });
    opener.once("exit", (code) => {
      if (code) console.log(`Otwórz w przeglądarce: ${url}`);
      resolve();
    });
  });
}
export async function runLauncher({ root = ownRoot, noOpen = false } = {}) {
  validateRuntime();
  const entry = path.join(root, "dist/server/server/index.js");
  const pathsFile = path.join(root, "dist/server/server/paths.js");
  const configFile = path.join(root, "dist/server/shared/config.js");
  if (
    ![
      entry,
      pathsFile,
      configFile,
      path.join(root, "dist/client/index.html"),
    ].every(existsSync)
  )
    throw new Error(
      "Brak gotowego buildu. W tym katalogu wykonaj npm ci oraz npm run build. Launcher nie uruchamia instalacji ani aktualizacji.",
    );
  const { resolveDataDir } = await import(pathToFileURL(pathsFile).href);
  const { HOST, PORT, VERSION } = await import(pathToFileURL(configFile).href);
  const dataDir = resolveDataDir(process.env.OBRAZOWNIK_DATA_DIR);
  const url = `http://${HOST}:${PORT}`;
  const probe = () => inspectRunningServer({ url, dataDir, version: VERSION });
  const initial = await probe();
  if (initial === "matching") {
    console.log(`Obrazownik już działa: ${url}`);
    if (!noOpen) await openBrowser(url);
    return;
  }
  if (initial !== "absent")
    throw new Error(
      "Port aplikacji jest zajęty albo odpowiada inna wersja lub inny folder danych. Nie zamknięto żadnego procesu.",
    );
  // Separate the child's process group so Terminal Ctrl+C is forwarded once,
  // rather than reaching it both directly and via this launcher.
  const child = spawn(process.execPath, [entry], {
    cwd: realpathSync(root),
    env: { ...process.env, OBRAZOWNIK_DATA_DIR: dataDir },
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  let done = false;
  child.once("exit", () => {
    done = true;
  });
  let stopping = false;
  const onSignal = (signal) => {
    if (!done && !stopping) {
      stopping = true;
      child.kill(signal);
    }
  };
  const interrupt = () => onSignal("SIGINT"),
    terminate = () => onSignal("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    let healthy = false;
    const deadline = Date.now() + 12_000;
    while (!done && Date.now() < deadline) {
      const state = await probe();
      if (state === "matching") {
        healthy = true;
        break;
      }
      if (state === "occupied") break;
      await delay(100);
    }
    if (!healthy) {
      if (!done) child.kill("SIGTERM"); // Only our own child, never a process discovered on a port.
      await exited;
      throw new Error(
        "Nie udało się potwierdzić uruchomienia Obrazownika. Sprawdź komunikat serwera powyżej.",
      );
    }
    console.log(`Gotowe: ${url}. Ctrl+C zatrzymuje lokalny serwer.`);
    if (!noOpen) await openBrowser(url);
    const result = await exited;
    if (result.code && !result.signal)
      throw new Error(`Serwer zakończył pracę z kodem ${result.code}.`);
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--no-open") || args.length > 1)
      throw new Error("Użycie: node scripts/start.mjs [--no-open]");
    await runLauncher({ noOpen: args.includes("--no-open") });
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Nie udało się uruchomić Obrazownika.",
    );
    process.exitCode = 1;
  }
}
