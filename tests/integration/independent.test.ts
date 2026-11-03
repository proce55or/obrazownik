import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Storage } from "../../src/server/storage.js";
import { createApp } from "../../src/server/app.js";
import { migrate, migrations } from "../../src/server/migrations.js";
import { allCards, cards } from "../../src/server/content.js";
import { CardSchema, publicCard, type Card } from "../../src/domain/cards.js";

const directories: string[] = [],
  stores = new Set<Storage>();
const apps: Awaited<ReturnType<typeof createApp>>[] = [];
function directory() {
  const dir = mkdtempSync(path.join(tmpdir(), "obrazownik-independent-"));
  directories.push(dir);
  return dir;
}
async function open(dir = directory()) {
  const store = await Storage.open(dir);
  stores.add(store);
  return store;
}
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const store of stores) store.close();
  stores.clear();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function reserve(index: number, overrides: Partial<Card> = {}): Card {
  const prototype = allCards.find(
    (card) => card.setRole === "independent_writing",
  );
  if (!prototype)
    throw new Error("Brak chronionych tematów do nowego pisania.");
  return CardSchema.parse({
    ...publicCard(prototype),
    id: `review-independent-${index}`,
    itemFamilyId: `review-independent-family-${index}`,
    ...overrides,
  });
}

test("public training catalog does not disclose reserved themes or allow training creation by reserved ID", async () => {
  const app = await createApp({ dataDir: directory(), serveClient: false });
  apps.push(app);
  const headers = { host: "127.0.0.1:4317" };
  const response = await app.inject({ url: "/api/cards", headers });
  expect(response.statusCode).toBe(200);
  const catalog = response.json().cards as Card[];
  expect(catalog.length).toBeGreaterThan(0);
  expect(
    catalog.every(
      (card) => card.setRole === "training" && card.partition === "training",
    ),
  ).toBe(true);
  const protectedCards = allCards.filter(
    (card) => card.setRole === "independent_writing",
  );
  expect(protectedCards.length).toBeGreaterThan(0);
  for (const protectedCard of protectedCards) {
    expect(
      catalog.some((card) => card.itemFamilyId === protectedCard.itemFamilyId),
    ).toBe(false);
    expect(response.body).not.toContain(protectedCard.prompt.stimulus);
  }
  const boot = await app.inject({ url: "/api/bootstrap", headers });
  const auth = {
    ...headers,
    origin: "http://127.0.0.1:4317",
    cookie: boot.cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; "),
    "x-csrf-token": boot.json().csrfToken,
  };
  const rejected = await app.inject({
    method: "POST",
    url: "/api/attempts",
    headers: auth,
    payload: { cardId: protectedCards[0].id, clientRequestId: randomUUID() },
  });
  expect(rejected.statusCode).toBe(404);
  expect(cards.every((card) => card.setRole === "training")).toBe(true);
});

test("new independent requests reserve different families and retry remains stable even after exhaustion", async () => {
  const store = await open(),
    pool = [reserve(1), reserve(2)],
    requestId = randomUUID();
  const first = store.createIndependent(pool, requestId);
  expect(first).toMatchObject({
    mode: "independent",
    setRole: "independent_writing",
    partition: "reserve",
    noveltyStatus: "new_confirmed",
    assistanceTracking: "known",
  });
  const second = store.createIndependent(pool, randomUUID());
  expect(second.itemFamilyId).not.toBe(first.itemFamilyId);
  expect(store.createIndependent([], requestId)).toEqual(first);
  expect(() => store.createIndependent(pool, randomUUID())).toThrow(
    /Wyczerpano/,
  );
  expect(store.listAttempts()).toHaveLength(2);
  expect(store.independentStatus(pool).remaining).toBe(0);
  const dir = store.dataDir;
  store.close();
  stores.delete(store);
  const reopened = await open(dir);
  expect(reopened.independentStatus(pool).remaining).toBe(0);
  expect(() => reopened.createIndependent(pool, randomUUID())).toThrow(
    /Wyczerpano/,
  );
});

test("simultaneous requests reserve separate item families atomically", async () => {
  const store = await open(),
    pool = [reserve(11), reserve(12)];
  const results = await Promise.all(
    [1, 2].map(() =>
      Promise.resolve().then(() => store.createIndependent(pool, randomUUID())),
    ),
  );
  expect(new Set(results.map((attempt) => attempt.itemFamilyId)).size).toBe(2);
  expect(
    store.exportData().exposures.filter((event) => event.kind === "reserved"),
  ).toHaveLength(2);
});

test("paraphrases and later versions cannot restore a theme to unseen status", async () => {
  const store = await open(),
    original = reserve(21),
    paraphrase = reserve(22, { itemFamilyId: originalFamily() });
  function originalFamily() {
    return "review-independent-family-21";
  }
  store.createIndependent([original], randomUUID());
  expect(() => store.createIndependent([paraphrase], randomUUID())).toThrow(
    /Wyczerpano/,
  );
  const changedVersion = {
    ...original,
    version: 2,
    itemFamilyId: "different-imported-lineage",
  };
  expect(() => store.createIndependent([changedVersion], randomUUID())).toThrow(
    /Wyczerpano/,
  );
});

test("available-topic count collapses paraphrases within the same item family", async () => {
  const store = await open(),
    original = reserve(31),
    paraphrase = reserve(32, { itemFamilyId: "review-independent-family-31" });
  expect(store.independentStatus([original, paraphrase]).remaining).toBe(1);
  store.previewCards([paraphrase]);
  expect(store.independentStatus([original, paraphrase]).remaining).toBe(0);
});

test("a preview exposure imported from another installation prevents reusing a protected paraphrase", async () => {
  const source = await open(),
    target = await open(),
    original = reserve(41),
    paraphrase = reserve(42, { itemFamilyId: originalFamily() }),
    fresh = reserve(43);
  function originalFamily() {
    return "review-independent-family-41";
  }
  source.previewCards([paraphrase]);
  const bundle = source.exportData();
  await target.importData(bundle, target.previewImport(bundle).digest);
  const selected = target.createIndependent([original, fresh], randomUUID());
  expect(selected.itemFamilyId).toBe(fresh.itemFamilyId);
});

test("legacy global history stays unknown for a newly reserved theme", async () => {
  const dir = directory(),
    db = new DatabaseSync(path.join(dir, "obrazownik.sqlite"));
  const now = "2025-02-03T10:00:00.000Z",
    id = randomUUID();
  try {
    await migrate(db, path.join(dir, "backups"), false, migrations.slice(0, 1));
    const legacy = {
      id,
      sessionId: null,
      cardId: "property-stone-01",
      cardVersion: 1,
      promptSnapshot: {
        title: "Dawna karta",
        stimulus: "Kamień",
        instruction: "Własny szczegół",
      },
      family: "property",
      partition: "training",
      mode: "training",
      status: "completed",
      revision: 0,
      currentText: "Stare własne słowa.",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      sourceAttemptId: null,
      constraints: [],
      selfRatings: null,
    };
    db.prepare(
      "INSERT INTO attempts(id,revision,status,record) VALUES (?,?,?,?)",
    ).run(id, 0, "completed", JSON.stringify(legacy));
  } finally {
    db.close();
  }
  const store = await open(dir),
    attempt = store.createIndependent([reserve(51)], randomUUID());
  expect(attempt.noveltyStatus).toBe("unknown");
  expect(store.independentStatus([reserve(52)]).history).toBe("unknown");
});

test("requesting help creates a separate working copy and preserves the original independent text", async () => {
  const store = await open(),
    source = store.createIndependent([reserve(61)], randomUUID());
  const saved = store.saveAttempt(source.id, {
    text: "  Mój żółty ślad.\nDrugi wers.  ",
    scaffolding: { own: "własna notatka" },
    expectedRevision: source.revision,
    clientMutationId: randomUUID(),
  });
  const action = {
    expectedRevision: saved.revision,
    clientMutationId: randomUUID(),
  };
  const helped = store.assistedCopy(source.id, action);
  expect(helped.attempt.id).not.toBe(source.id);
  expect(helped.attempt).toMatchObject({
    mode: "training",
    status: "draft",
    sourceAttemptId: source.id,
    currentText: saved.currentText,
    scaffolding: saved.scaffolding,
  });
  const original = store.getAttempt(source.id);
  expect(original).toMatchObject({
    mode: "independent",
    currentText: saved.currentText,
    scaffolding: saved.scaffolding,
  });
  expect(
    store.versions(source.id).find((version) => version.reason === "manual")
      ?.text,
  ).toBe(saved.currentText);
  expect(store.assistedCopy(source.id, action)).toEqual(helped);
  const changed = store.saveAttempt(helped.attempt.id, {
    text: "Inna wersja z pomocą.",
    expectedRevision: helped.attempt.revision,
    clientMutationId: randomUUID(),
  });
  const hint = store.prepareHint(
    changed.id,
    {
      expectedRevision: changed.revision,
      level: 1,
      clientMutationId: randomUUID(),
    },
    "Który szczegół chcesz zachować?",
  );
  store.deliverHint(changed.id, hint.event.id);
  expect(store.detail(changed.id).assistanceState).toBe("assisted");
  expect(store.getAttempt(source.id).currentText).toBe(saved.currentText);
  expect(store.assistance(source.id)).toHaveLength(0);
  expect(() =>
    store.saveAttempt(source.id, {
      text: "Spóźniona karta",
      expectedRevision: saved.revision,
      clientMutationId: randomUUID(),
    }),
  ).toThrow();
});

test("new independent work selects the latest card version while preserving theme history", async () => {
  const store = await open();
  const old = reserve(91, { version: 1 });
  const current = {
    ...old,
    version: 2,
    prompt: { ...old.prompt, instruction: "Nowe proste polecenie." },
  };
  const attempt = store.createIndependent([old, current], randomUUID());
  expect(attempt.cardVersion).toBe(2);
  expect(attempt.promptSnapshot.instruction).toBe(current.prompt.instruction);
  expect(() => store.createIndependent([old, current], randomUUID())).toThrow(
    /Wyczerpano/,
  );
});
