import { afterEach, expect, test } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setImmediate as nextTurn } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { Storage } from "../../src/server/storage.js";
import { cards } from "../../src/server/content.js";
import type { Attempt } from "../../src/shared/schemas.js";

const directories: string[] = [],
  stores = new Set<Storage>();
afterEach(() => {
  for (const store of stores) store.close();
  stores.clear();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
async function fixture() {
  const clock = { now: new Date("2026-03-28T12:00:00.000Z") },
    dir = mkdtempSync(path.join(tmpdir(), "obrazownik-backup-concurrency-"));
  directories.push(dir);
  const store = await Storage.open(dir, {
    clock: () => new Date(clock.now),
    random: () => 0,
  });
  stores.add(store);
  store.updateSettings({
    ...store.settings(),
    timezone: "Europe/Warsaw",
    repeatEnabled: true,
    repeatOffsetsDays: [2, 7, 21],
  });
  return { store, clock, dir };
}
function complete(store: Storage, attempt: Attempt) {
  return store.finish(
    attempt.id,
    { expectedRevision: attempt.revision, clientMutationId: randomUUID() },
    "completed",
  );
}

test("asynchronous backup remains a committed WAL snapshot during ten writes and rollbacks on the same database", async () => {
  const { store, dir } = await fixture();
  // More than a backup step of pages, so the real async API must yield while copying.
  for (let i = 0; i < 50; i++)
    store.createDocument({
      title: `Syntetyczny dokument ${i}`,
      text: "Źdźbło na łące. ".repeat(1300),
      clientRequestId: randomUUID(),
    });
  let attempt = store.createAttempt(cards[0], randomUUID());
  attempt = store.saveAttempt(attempt.id, {
    text: "Stan początkowy.\nŻółć.",
    expectedRevision: 0,
    clientMutationId: randomUUID(),
  });
  const committed = new Map<number, string>([
    [attempt.revision, attempt.currentText],
  ]);
  const writer = new DatabaseSync(path.join(dir, "obrazownik.sqlite"));
  writer.exec("PRAGMA busy_timeout=5000");
  const copying = store.backup("manual");
  try {
    for (let i = 0; i < 10; i++) {
      attempt = store.saveAttempt(attempt.id, {
        text: `Zatwierdzony zapis ${i}.\nZażółć gęślą jaźń.`,
        expectedRevision: attempt.revision,
        clientMutationId: randomUUID(),
      });
      committed.set(attempt.revision, attempt.currentText);
      writer.exec("BEGIN IMMEDIATE");
      writer
        .prepare(
          "UPDATE attempts SET record=json_set(record,'$.currentText',?) WHERE id=?",
        )
        .run("NIGDY NIEZATWIERDZONY TEKST", attempt.id);
      writer.exec("ROLLBACK");
      await nextTurn();
    }
    const filename = await copying;
    const copy = new DatabaseSync(path.join(dir, "backups", filename), {
      readOnly: true,
    });
    try {
      expect(
        copy.prepare("PRAGMA integrity_check").get()?.integrity_check,
      ).toBe("ok");
      const row = copy
        .prepare("SELECT record FROM attempts WHERE id=?")
        .get(attempt.id);
      const saved = JSON.parse(String(row?.record)) as Attempt;
      expect(committed.get(saved.revision)).toBe(saved.currentText);
      expect(saved.currentText).not.toContain("NIGDY NIEZATWIERDZONY");
      expect(
        Number(
          copy.prepare("SELECT COUNT(*) count FROM documents").get()?.count,
        ),
      ).toBe(50);
    } finally {
      copy.close();
    }
    expect(store.getAttempt(attempt.id).currentText).toBe(attempt.currentText);
    expect(
      readdirSync(path.join(dir, "backups")).some((name) =>
        name.endsWith(".tmp"),
      ),
    ).toBe(false);
  } finally {
    writer.close();
    await copying;
  }
});

test("retry of yesterday's completed session does not create today's automatic backup", async () => {
  const { store, clock } = await fixture();
  const session = store.createSession(cards, { clientRequestId: randomUUID() });
  complete(store, store.getAttempt(session.attemptIds[0]));
  const action = {
    clientMutationId: randomUUID(),
    status: "completed" as const,
  };
  const ended = await store.endSession(session.id, action);
  clock.now = new Date("2026-03-29T12:00:00.000Z");
  expect(await store.endSession(session.id, action)).toEqual(ended);
  expect(
    store
      .backupList()
      .filter((file) => file.name.startsWith("auto-2026-03-28-")),
  ).toHaveLength(1);
  expect(
    store
      .backupList()
      .filter((file) => file.name.startsWith("auto-2026-03-29-")),
  ).toHaveLength(0);
  const today = store.createSession(cards, { clientRequestId: randomUUID() });
  complete(store, store.getAttempt(today.attemptIds[0]));
  await store.endSession(today.id, {
    clientMutationId: randomUUID(),
    status: "completed",
  });
  expect(
    store
      .backupList()
      .filter((file) => file.name.startsWith("auto-2026-03-29-")),
  ).toHaveLength(1);
});

test("two due originals still yield at most one proposed review across all sessions of one day", async () => {
  const { store, clock } = await fixture();
  complete(store, store.createAttempt(cards[0], randomUUID()));
  complete(store, store.createAttempt(cards[1], randomUUID()));
  expect(store.exportData().reviews).toHaveLength(6);
  clock.now = new Date("2026-03-30T12:00:00.000Z");
  expect(store.reviews()).toHaveLength(2);
  const first = store.createSession(cards, { clientRequestId: randomUUID() });
  expect(
    first.attemptIds
      .map((id) => store.getAttempt(id))
      .filter((attempt) => attempt.mode === "repeat"),
  ).toHaveLength(1);
  await store.endSession(first.id, {
    clientMutationId: randomUUID(),
    status: "abandoned",
  });
  expect(store.reviews()).toHaveLength(1);
  const second = store.createSession(cards, { clientRequestId: randomUUID() });
  expect(
    second.attemptIds
      .map((id) => store.getAttempt(id))
      .filter((attempt) => attempt.mode === "repeat"),
  ).toHaveLength(0);
  await store.endSession(second.id, {
    clientMutationId: randomUUID(),
    status: "abandoned",
  });
  clock.now = new Date("2026-03-31T12:00:00.000Z");
  const tomorrow = store.createSession(cards, {
    clientRequestId: randomUUID(),
  });
  expect(
    tomorrow.attemptIds
      .map((id) => store.getAttempt(id))
      .filter((attempt) => attempt.mode === "repeat"),
  ).toHaveLength(1);
  expect(store.exportData().reviews).toHaveLength(6);
});

test("a review of a locally archived card uses its preserved definition instead of blocking the queue", async () => {
  const { store, clock } = await fixture();
  const archived = {
    ...cards[0],
    id: "backup-review-local-card",
    version: 4,
    itemFamilyId: "backup-review-local-family",
    prompt: {
      title: "Moja archiwalna karta",
      stimulus: "Osobny szczegół",
      instruction: "Zachowana lokalna instrukcja.",
    },
  };
  const source = complete(store, store.createAttempt(archived, randomUUID()));
  clock.now = new Date("2026-03-30T12:00:00.000Z");
  const session = store.createSession(cards, { clientRequestId: randomUUID() });
  const repeat = session.attemptIds
    .map((id) => store.getAttempt(id))
    .find((attempt) => attempt.mode === "repeat");
  expect(repeat).toMatchObject({
    sourceAttemptId: source.id,
    promptSnapshot: archived.prompt,
  });
});
