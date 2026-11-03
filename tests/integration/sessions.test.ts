import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
async function fixture(initial = "2026-03-28T12:00:00.000Z") {
  const clock = { now: new Date(initial) },
    dir = mkdtempSync(path.join(tmpdir(), "obrazownik-sessions-"));
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
  const input = {
    expectedRevision: attempt.revision,
    clientMutationId: randomUUID(),
  };
  return { input, attempt: store.finish(attempt.id, input, "completed") };
}
function original(store: Storage) {
  return store.createAttempt(cards[0], randomUUID());
}

test("original completion schedules 2/7/21 calendar-day reviews once across DST", async () => {
  const { store, clock } = await fixture();
  const source = original(store),
    completed = complete(store, source);
  expect(store.finish(source.id, completed.input, "completed")).toEqual(
    completed.attempt,
  );
  expect(
    store
      .exportData()
      .reviews.map((review) => review.dueLocalDate)
      .sort(),
  ).toEqual(["2026-03-30", "2026-04-04", "2026-04-18"]);
  expect(store.reviews()).toEqual([]);
  clock.now = new Date("2026-03-29T21:30:00.000Z");
  expect(store.reviews()).toHaveLength(0);
  clock.now = new Date("2026-03-29T22:30:00.000Z");
  expect(store.reviews()).toHaveLength(1);
  expect(store.reviews()[0].offsetDays).toBe(2);
});

test("session holds two new tasks and at most one due repeat, and repeated creation preserves the active session", async () => {
  const { store, clock } = await fixture();
  const source = complete(store, original(store)).attempt;
  clock.now = new Date("2026-03-30T12:00:00.000Z");
  const request = { clientRequestId: randomUUID(), energy: "low" as const };
  const session = store.createSession(cards, request);
  const attempts = session.attemptIds.map((id) => store.getAttempt(id));
  expect(attempts).toHaveLength(3);
  expect(
    attempts.filter((attempt) => attempt.mode === "training"),
  ).toHaveLength(2);
  expect(attempts.filter((attempt) => attempt.mode === "repeat")).toHaveLength(
    1,
  );
  expect(
    attempts.find((attempt) => attempt.mode === "repeat")?.sourceAttemptId,
  ).toBe(source.id);
  expect(new Set(attempts.map((attempt) => attempt.cardId)).size).toBe(3);
  expect(store.getSession(session.id)).toEqual(session);
  expect(store.activeSession()).toEqual(session);
  expect(store.createSession(cards, request)).toEqual(session);
  expect(store.createSession(cards, { clientRequestId: randomUUID() })).toEqual(
    session,
  );
  expect(store.exportData().sessions).toHaveLength(1);
});

test("repeat completes one scheduled term without creating another schedule", async () => {
  const { store, clock } = await fixture();
  const source = complete(store, original(store)).attempt;
  clock.now = new Date("2026-03-30T12:00:00.000Z");
  const session = store.createSession(cards, { clientRequestId: randomUUID() });
  const repeat = session.attemptIds
    .map((id) => store.getAttempt(id))
    .find((attempt) => attempt.mode === "repeat")!;
  complete(store, repeat);
  const reviews = store.exportData().reviews;
  expect(reviews).toHaveLength(3);
  expect(reviews.every((review) => review.sourceAttemptId === source.id)).toBe(
    true,
  );
  expect(reviews.filter((review) => review.state === "completed")).toHaveLength(
    1,
  );
  expect(
    reviews.find((review) => review.state === "completed")?.attemptId,
  ).toBe(repeat.id);
  await store.endSession(session.id, {
    clientMutationId: randomUUID(),
    status: "abandoned",
  });
  const again = store.createSession(cards, { clientRequestId: randomUUID() });
  expect(
    again.attemptIds
      .map((id) => store.getAttempt(id))
      .some((attempt) => attempt.mode === "repeat"),
  ).toBe(false);
});

test("skipping a review or abandoning a session creates no make-up debt or new schedules", async () => {
  const { store, clock } = await fixture();
  complete(store, original(store));
  clock.now = new Date("2026-03-30T12:00:00.000Z");
  const session = store.createSession(cards, { clientRequestId: randomUUID() });
  const repeat = session.attemptIds
    .map((id) => store.getAttempt(id))
    .find((attempt) => attempt.mode === "repeat")!;
  store.finish(
    repeat.id,
    { expectedRevision: repeat.revision, clientMutationId: randomUUID() },
    "skipped",
  );
  await store.endSession(session.id, {
    clientMutationId: randomUUID(),
    status: "abandoned",
  });
  expect(store.activeSession()).toBeNull();
  expect(store.exportData().reviews).toHaveLength(3);
  expect(
    store.exportData().reviews.filter((review) => review.state === "skipped"),
  ).toHaveLength(1);
  clock.now = new Date("2026-03-31T12:00:00.000Z");
  expect(store.reviews()).toEqual([]);
  const next = store.createSession(cards, { clientRequestId: randomUUID() });
  expect(
    next.attemptIds
      .map((id) => store.getAttempt(id))
      .some((attempt) => attempt.mode === "repeat"),
  ).toBe(false);
});

test("family selection applies to fresh tasks and abandoned drafts never create review schedules", async () => {
  const { store } = await fixture();
  const session = store.createSession(cards, {
    clientRequestId: randomUUID(),
    family: "verb",
  });
  expect(session.attemptIds).toHaveLength(2);
  expect(
    session.attemptIds
      .map((id) => store.getAttempt(id))
      .every((attempt) => attempt.family === "verb"),
  ).toBe(true);
  await store.endSession(session.id, {
    clientMutationId: randomUUID(),
    status: "abandoned",
  });
  expect(
    session.attemptIds
      .map((id) => store.getAttempt(id))
      .every((attempt) => attempt.status === "abandoned"),
  ).toBe(true);
  expect(store.exportData().reviews).toEqual([]);
});

test("first completed session per local day creates only one automatic backup even with concurrent retry", async () => {
  const { store, clock } = await fixture();
  const session = store.createSession(cards, { clientRequestId: randomUUID() });
  complete(store, store.getAttempt(session.attemptIds[0]));
  const action = {
    clientMutationId: randomUUID(),
    status: "completed" as const,
  };
  await Promise.all([
    store.endSession(session.id, action),
    store.endSession(session.id, action),
  ]);
  expect(
    store
      .backupList()
      .filter((file) => file.name.startsWith("auto-2026-03-28-")),
  ).toHaveLength(1);
  const another = store.createSession(cards, { clientRequestId: randomUUID() });
  await store.endSession(another.id, {
    clientMutationId: randomUUID(),
    status: "completed",
  });
  expect(
    store
      .backupList()
      .filter((file) => file.name.startsWith("auto-2026-03-28-")),
  ).toHaveLength(1);
  clock.now = new Date("2026-03-29T12:00:00.000Z");
  const tomorrow = store.createSession(cards, {
    clientRequestId: randomUUID(),
  });
  await store.endSession(tomorrow.id, {
    clientMutationId: randomUUID(),
    status: "completed",
  });
  expect(
    store
      .backupList()
      .filter((file) => file.name.startsWith("auto-2026-03-29-")),
  ).toHaveLength(1);
});

test("empty abandoned sessions remain usable after all fresh cards are reserved", async () => {
  const { store, clock } = await fixture();
  const pool = cards.filter(
    (card) => !["M2", "M3", "M5"].includes(card.methodId),
  );
  expect(pool).toHaveLength(60);
  for (let i = 0; i < 30; i++) {
    const session = store.createSession(pool, {
      clientRequestId: randomUUID(),
    });
    expect(session.attemptIds).toHaveLength(2);
    await store.endSession(session.id, {
      clientMutationId: randomUUID(),
      status: "abandoned",
    });
    clock.now = new Date(clock.now.getTime() + 1000);
  }
  const before = store.exportData();
  const session = store.createSession(pool, { clientRequestId: randomUUID() });
  const attempts = session.attemptIds.map((id) => store.getAttempt(id));
  expect(attempts).toHaveLength(2);
  expect(
    attempts.every(
      (a) =>
        a.mode === "repeat" && a.noveltyStatus === "seen" && a.sourceAttemptId,
    ),
  ).toBe(true);
  expect(attempts.map((a) => a.cardId).sort()).toEqual(
    before.attempts
      .slice(0, 2)
      .map((a) => a.cardId)
      .sort(),
  );
  expect(store.exportData().exposures).toEqual(before.exposures);
  expect(attempts.every((a) => a.setRole === "training")).toBe(true);
  complete(store, attempts[0]);
  expect(store.exportData().reviews).toHaveLength(3);
});

test("injected clock controls writing timestamps as well as session scheduling", async () => {
  const { store, clock } = await fixture("2020-01-02T12:00:00.000Z");
  const attempt = original(store);
  expect(attempt.createdAt).toBe(clock.now.toISOString());
  clock.now = new Date("2020-01-03T12:00:00.000Z");
  const saved = store.saveAttempt(attempt.id, {
    text: "Tekst testowy",
    expectedRevision: attempt.revision,
    clientMutationId: randomUUID(),
  });
  expect(saved.updatedAt).toBe(clock.now.toISOString());
});
