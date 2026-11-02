import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Storage } from "../../src/server/storage.js";
import { createApp } from "../../src/server/app.js";
import { cards } from "../../src/server/content.js";
import type { Card } from "../../src/domain/cards.js";

const dirs: string[] = [],
  stores = new Set<Storage>(),
  apps: Awaited<ReturnType<typeof createApp>>[] = [];
function dir() {
  const value = mkdtempSync(path.join(tmpdir(), "obrazownik-source-workshop-"));
  dirs.push(value);
  return value;
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const store of stores) store.close();
  stores.clear();
  for (const value of dirs.splice(0))
    rmSync(value, { recursive: true, force: true });
});
async function open() {
  const store = await Storage.open(dir());
  stores.add(store);
  return store;
}
function sourceCard() {
  const card = cards.find(
    (card) => card.methodId === "M7" && card.sourceText !== null,
  );
  if (!card) throw new Error("Brak karty M7 z materiałem źródłowym.");
  return card;
}

test("source material counts as prepared word-bank assistance before acknowledgment and assisted afterward", async () => {
  const store = await open(),
    card = sourceCard(),
    attempt = store.createAttempt(card, randomUUID());
  expect(attempt.sourceText).toBe(card.sourceText);
  const before = store.detail(attempt.id),
    bank = before.assistanceEvents.find((event) => event.kind === "word_bank")!;
  expect(bank.status).toBe("prepared");
  expect(before.assistanceState).toBe("unknown");
  expect(before.versions[0]).toMatchObject({
    reason: "pre_hint",
    text: "",
    scaffolding: {},
    assistanceStateAtCapture: "none_confirmed",
  });
  store.deliverHint(attempt.id, bank.id);
  expect(store.detail(attempt.id).assistanceState).toBe("assisted");
  const fields = { ownership: "Dopisuję własne słowa i zmieniam kolejność." },
    text = "Mój nowy żółty obraz — poza bankiem słów.\nWłasna druga linia.";
  const saved = store.saveAttempt(attempt.id, {
    text,
    scaffolding: fields,
    expectedRevision: attempt.revision,
    clientMutationId: randomUUID(),
  });
  store.finish(
    attempt.id,
    { expectedRevision: saved.revision, clientMutationId: randomUUID() },
    "completed",
  );
  expect(store.getAttempt(attempt.id).sourceText).toBe(card.sourceText);
  expect(
    store.versions(attempt.id).find((version) => version.reason === "final"),
  ).toMatchObject({
    text,
    scaffolding: fields,
    assistanceStateAtCapture: "assisted",
  });
});

test("a word-bank event does not swallow a distinct level-one question and uncertain source delivery remains unknown", async () => {
  const store = await open(),
    attempt = store.createAttempt(sourceCard(), randomUUID());
  const request = {
    level: 1,
    expectedRevision: attempt.revision,
    clientMutationId: randomUUID(),
  };
  const hint = store.prepareHint(
    attempt.id,
    request,
    "Co chcesz zmienić we własnym obrazie?",
  );
  expect(hint.event.kind).toBe("question");
  expect(
    store.prepareHint(
      attempt.id,
      request,
      "Co chcesz zmienić we własnym obrazie?",
    ),
  ).toEqual(hint);
  store.deliverHint(attempt.id, hint.event.id);
  expect(store.assistance(attempt.id)).toHaveLength(2);
  expect(store.detail(attempt.id).assistanceState).toBe("unknown");
});

test("optional M2/M3/M5 variants are individually gated without removing existing drafts", async () => {
  const app = await createApp({ dataDir: dir(), serveClient: false });
  apps.push(app);
  const headers = { host: "127.0.0.1:4317" },
    boot = await app.inject({ url: "/api/bootstrap", headers });
  const auth = {
    ...headers,
    origin: "http://127.0.0.1:4317",
    cookie: boot.cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; "),
    "x-csrf-token": boot.json().csrfToken,
  };
  const initialSettings = boot.json().settings;
  const methods = ["M2", "M3", "M5"] as const;
  const initial = (await app.inject({ url: "/api/cards", headers })).json()
    .cards as Card[];
  expect(
    initial.every(
      (card) => !methods.includes(card.methodId as (typeof methods)[number]),
    ),
  ).toBe(true);
  let firstDraft: string | undefined;
  for (const enabled of methods) {
    const changed = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: auth,
      payload: { ...initialSettings, optionalMethods: [enabled] },
    });
    expect(changed.statusCode).toBe(200);
    const visible = (await app.inject({ url: "/api/cards", headers })).json()
      .cards as Card[];
    expect(visible.some((card) => card.methodId === enabled)).toBe(true);
    for (const disabled of methods.filter((method) => method !== enabled))
      expect(visible.some((card) => card.methodId === disabled)).toBe(false);
    const selected = cards.find((card) => card.methodId === enabled)!;
    const created = await app.inject({
      method: "POST",
      url: "/api/attempts",
      headers: auth,
      payload: { cardId: selected.id, clientRequestId: randomUUID() },
    });
    expect(created.statusCode).toBe(200);
    firstDraft ??= created.json().id;
    const disabled = cards.find(
      (card) =>
        methods.includes(card.methodId as (typeof methods)[number]) &&
        card.methodId !== enabled,
    )!;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/attempts",
          headers: auth,
          payload: { cardId: disabled.id, clientRequestId: randomUUID() },
        })
      ).statusCode,
    ).toBe(409);
  }
  await app.inject({
    method: "PATCH",
    url: "/api/settings",
    headers: auth,
    payload: { ...initialSettings, optionalMethods: [] },
  });
  expect(
    (await app.inject({ url: `/api/attempts/${firstDraft}`, headers }))
      .statusCode,
  ).toBe(200);
});
