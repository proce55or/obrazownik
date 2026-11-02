#!/usr/bin/env node
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BIELIK_URL, BIELIK_ALIAS, MODEL_SHA256, MODEL_REVISION, RUNTIME_COMMIT, localBielikPaths, inspectBielik } from "./start-bielik.mjs";

const cases = [
  { id: "sensory", text: "Ćwiczenie: opisz zwykły przedmiot zmysłami. Przedmiot: kubek. Zadaj jedno krótkie pytanie naprowadzające, które pomoże mi samodzielnie znaleźć szczegół." },
  { id: "association", text: "Ćwiczenie: znajdź własne skojarzenie między deszczem a zegarem. Zadaj jedno krótkie pytanie naprowadzające. Nie podawaj skojarzenia ani gotowego obrazu." },
  { id: "scene", text: "Ćwiczenie: pokaż pośpiech przez działanie w poczekalni. Zadaj jedno krótkie pytanie o obserwowalny szczegół. Nie pisz sceny ani zdania do wykorzystania." },
];
const args = process.argv.slice(2);
let durationMinutes = 0, intervalSeconds = 600;
for (let i = 0; i < args.length; i += 2) {
  const value = Number(args[i + 1]);
  if (!Number.isFinite(value) || value < 0) throw new Error("Niepoprawny czas testu.");
  if (args[i] === "--duration-minutes" && value <= 480) durationMinutes = value;
  else if (args[i] === "--interval-seconds" && value >= 30 && value <= 3600) intervalSeconds = value;
  else throw new Error("Użycie: benchmark-bielik.mjs [--duration-minutes 0..480] [--interval-seconds 30..3600]");
}
if (await inspectBielik() !== "matching") throw new Error("Brak właściwego lokalnego Bielika na127.0.0.1:4320.");
const dir = localBielikPaths().logs;
mkdirSync(dir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replaceAll(":", "-");
const output = path.join(dir, `benchmark-${stamp}.jsonl`);
const summary = path.join(dir, `benchmark-${stamp}-summary.json`);
const started = Date.now(), deadline = started + durationMinutes * 60_000;
const rows = [];
let stopping = false;
const interrupted = new globalThis.AbortController();
const stop = () => { stopping = true; interrupted.abort(); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
console.log(`Test wyłącznie syntetyczny. Wyniki: ${output}`);
async function measure(test, round) {
  const t0 = globalThis.performance.now();
  let firstTokenMs = null, text = "", usage = null, timings = null, finishReason = null;
  const response = await fetch(`${BIELIK_URL}/v1/chat/completions`, {
    method: "POST", redirect: "error", signal: globalThis.AbortSignal.any([globalThis.AbortSignal.timeout(150_000), interrupted.signal]),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: BIELIK_ALIAS, stream: true, stream_options: { include_usage: true },
      temperature: 0.3, seed: round + 17, max_tokens: 56,
      messages: [{ role: "system", content: "Pomagasz autorowi samodzielnie ćwiczyć język obrazowy. Odpowiedz po polsku jednym krótkim pytaniem otwartym. Bez wstępu, przykładów, odpowiedzi za autora i wierszy." },
        { role: "user", content: test.text }] }),
  });
  if (!response.ok) throw new Error(`HTTP${response.status}`);
  let buffer = "";
  const decoder = new globalThis.TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n"); buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      const value = JSON.parse(line.slice(6));
      const content = value.choices?.[0]?.delta?.content;
      if (content) { firstTokenMs ??= globalThis.performance.now() - t0; text += content; }
      if (value.usage) usage = value.usage;
      if (value.timings) timings = value.timings;
      if (value.choices?.[0]?.finish_reason) finishReason = value.choices[0].finish_reason;
    }
  }
  return { at: new Date().toISOString(), round, case: test.id,
    firstTokenMs, totalMs: globalThis.performance.now() - t0, text, usage, timings, finishReason,
    endsWithQuestion: text.trim().endsWith("?"), questionMarks: (text.match(/\?/g) || []).length };
}
let round = 0;
do {
  for (const test of cases) {
    if (stopping || (round > 0 && Date.now() >= deadline)) break;
    let row;
    try { row = await measure(test, round); }
    catch (error) { row = { at: new Date().toISOString(), round, case: test.id, error: error.message }; }
    rows.push(row);
    appendFileSync(output, `${JSON.stringify(row)}\n`, { mode: 0o600 });
    console.log(`${round}/${test.id}: ${row.error || `${Math.round(row.firstTokenMs)}ms pierwszy token, ${Math.round(row.totalMs)}ms całość`}`);
  }
  round++;
  if (!durationMinutes || stopping || Date.now() >= deadline) break;
  // Short waits make Ctrl+C responsive without keeping the computer awake forever.
  const next = Math.min(deadline, Date.now() + intervalSeconds * 1000);
  while (!stopping && Date.now() < next) await delay(Math.min(1000, next - Date.now()));
} while (!stopping && Date.now() < deadline);
const success = rows.filter((row) => !row.error);
const median = (key) => { const values = success.map((r) => r[key]).filter(Number.isFinite).sort((a,b) => a-b); return values.length ? values[Math.floor(values.length / 2)] : null; };
writeFileSync(summary, JSON.stringify({ startedAt: new Date(started).toISOString(), endedAt: new Date().toISOString(),
  model: BIELIK_ALIAS, modelRevision: MODEL_REVISION, sha256: MODEL_SHA256, runtimeCommit: RUNTIME_COMMIT,
  backend: "CPU AVX2; Metal OFF", threads: 4, context: 2048, slots: 1,
  samples: rows.length, failures: rows.length - success.length,
  medianFirstTokenMs: median("firstTokenMs"), medianTotalMs: median("totalMs"),
  note: "Syntetyczne próby techniczne. Jakość wymaga ręcznej oceny; nie jest to dowód skuteczności treningu." }, null, 2), { mode: 0o600 });
console.log(`Zakończono. Podsumowanie: ${summary}`);
if (!success.length) process.exitCode = 1;
