#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, statSync, realpathSync, readFileSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { runLauncher, validateRuntime } from "./start.mjs";

export const BIELIK_URL = "http://127.0.0.1:4320";
export const BIELIK_ALIAS = "bielik-7b-local";
export const MODEL_SHA256 = "0c1475426645924970b9ed1383df1ce89c47b991e7b78ce9a12d3fde94455b16";
export const MODEL_REVISION = "8f973025458d5119b688e3b60ee1ca40ffd8313d";
export const RUNTIME_COMMIT = "8642541b255bfb5dc39cd351a178be09013a55d6";
export function localBielikPaths(home = os.homedir()) {
  const base = path.join(home, "Obrazownik-modele");
  return {
    binary: path.join(base, "runtime/llama.cpp/build/bin/llama-server"),
    model: path.join(base, "bielik-7b/minitron-Bielik-7B-v3.0-Instruct-GGUF.Q4_K_M.gguf"),
    manifest: path.join(base, "bielik-7b/manifest.json"),
    logs: path.join(base, "bielik-7b/logs"),
  };
}
export async function inspectBielik(model = localBielikPaths().model, fetchImpl = fetch) {
  try {
    const get = async (route) => {
      const response = await fetchImpl(`${BIELIK_URL}${route}`, {
        signal: globalThis.AbortSignal.timeout(2000), redirect: "error",
      });
      return response.ok ? response.json() : null;
    };
    const health = await get("/health");
    if (health?.status !== "ok") return "occupied";
    const props = await get("/props");
    const models = await get("/v1/models");
    return props?.model_path === model && props?.total_slots === 1 &&
      props?.build_info?.endsWith(`-${RUNTIME_COMMIT.slice(0, 7)}`) &&
      models?.data?.some((entry) => entry.id === BIELIK_ALIAS)
      ? "matching" : "occupied";
  } catch (error) {
    return error?.cause?.code === "ECONNREFUSED" ? "absent" : "occupied";
  }
}
export async function runBielikLauncher({ noOpen = false } = {}) {
  validateRuntime();
  const files = localBielikPaths();
  const initial = await inspectBielik(files.model);
  if (initial === "matching") {
    console.log(`Lokalny Bielik już działa: ${BIELIK_URL}`);
    await runLauncher({ noOpen });
    return;
  }
  if (initial !== "absent") throw new Error("Port4320 jest zajęty lub odpowiada inny model. Nie zatrzymano żadnego procesu.");
  if (![files.binary, files.model, files.manifest].every(existsSync))
    throw new Error("Brak zainstalowanego Bielika lub runtime w ~/Obrazownik-modele. Launcher nie pobiera ani nie instaluje plików.");
  const manifest = JSON.parse(readFileSync(files.manifest, "utf8"));
  if (manifest.sha256 !== MODEL_SHA256 || manifest.revision !== MODEL_REVISION || manifest.runtimeCommit !== RUNTIME_COMMIT ||
      statSync(files.model).size !== 4501556256)
    throw new Error("Manifest lub rozmiar Bielika nie odpowiada zweryfikowanej instalacji.");
  console.log("Sprawdzam SHA256 lokalnych wag Bielika…");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(files.model)) hash.update(chunk);
  if (hash.digest("hex") !== MODEL_SHA256) throw new Error("SHA256 wag Bielika nie zgadza się z oficjalnym plikiem. Model nie został uruchomiony.");
  mkdirSync(files.logs, { recursive: true, mode: 0o700 });
  const logfile = path.join(files.logs, `server-${Date.now()}.log`);
  const output = openSync(logfile, "a", 0o600);
  const serverArgs = [
    "--model", files.model, "--alias", BIELIK_ALIAS,
    "--host", "127.0.0.1", "--port", "4320",
    "--threads", "4", "--threads-batch", "4", "--ctx-size", "2048",
    "--parallel", "1", "--n-gpu-layers", "0", "--n-predict", "96",
    "--no-webui", "--no-slots", "--cors-origins", "http://127.0.0.1:4317",
  ];
  const binary = realpathSync(files.binary);
  const child = spawn(process.platform === "darwin" ? "/usr/bin/nice" : binary,
    process.platform === "darwin" ? ["-n", "10", binary, ...serverArgs] : serverArgs, {
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("LLAMA_") && !key.startsWith("GGML_"))), VECLIB_MAXIMUM_THREADS: "4" },
    stdio: ["ignore", output, output], detached: process.platform !== "win32",
  });
  closeSync(output);
  let done = false;
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => { done = true; resolve({ code, signal }); });
  });
  // A spawn failure can happen before readiness polling reaches the process.
  exited.catch(() => { done = true; });
  let stopping = false;
  const stop = () => { if (!done && !stopping) { stopping = true; child.kill("SIGTERM"); } };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    const deadline = Date.now() + 180_000;
    let ready = false;
    while (!done && !stopping && Date.now() < deadline) {
      if (await inspectBielik(files.model) === "matching") { ready = true; break; }
      await delay(500);
    }
    if (!ready) throw new Error(`Nie udało się uruchomić właściwego Bielika. Log: ${logfile}`);
    console.log(`Bielik gotowy: ${BIELIK_URL}, CPU4, ctx2048. Log: ${logfile}`);
    await runLauncher({ noOpen });
    // If the app was already running, keep ownership of the newly started model.
    if (!stopping) console.log("Bielik działa. Ctrl+C zatrzyma model uruchomiony przez ten launcher.");
    const result = await exited;
    if (result.code && !result.signal) throw new Error(`Bielik zakończył pracę z kodem ${result.code}. Log: ${logfile}`);
  } finally {
    stop();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some((arg) => arg !== "--no-open"))
      throw new Error("Użycie: node scripts/start-bielik.mjs [--no-open]");
    await runBielikLauncher({ noOpen: args.includes("--no-open") });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
