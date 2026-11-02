import { afterEach, expect, test } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readdirSync,
  symlinkSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Storage } from "../../src/server/storage.js";
import { migrate, migrations } from "../../src/server/migrations.js";
import { cards } from "../../src/server/content.js";

const directories: string[] = [];
const stores = new Set<Storage>();
const directory = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "obrazownik-science-transfer-"));
  directories.push(dir);
  return dir;
};
async function open(dir = directory()) {
  const store = await Storage.open(dir);
  stores.add(store);
  return store;
}
afterEach(() => {
  for (const store of stores) store.close();
  stores.clear();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function legacyAttempt() {
  const createdAt = "2025-04-03T09:12:34.000Z";
  return {
    id: randomUUID(),
    sessionId: null,
    cardId: "property-stone-01",
    cardVersion: 1,
    promptSnapshot: {
      title: "Dawna karta",
      stimulus: "Kamień",
      instruction: "Własny szczegół.",
    },
    family: "property",
    partition: "training",
    mode: "training",
    status: "completed",
    revision: 7,
    currentText: "  Zażółć gęślą jaźń.\n\nŚlad po słowie.  ",
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
    sourceAttemptId: null,
    constraints: [],
    selfRatings: null,
  };
}
async function legacyFixture() {
  const dir = directory(),
    attempt = legacyAttempt();
  const version = {
    id: randomUUID(),
    attemptId: attempt.id,
    text: attempt.currentText,
    createdAt: attempt.createdAt,
    reason: "final",
    assistanceLevelAtCapture: 0,
  };
  const exposure = {
    id: randomUUID(),
    attemptId: attempt.id,
    cardId: attempt.cardId,
    cardVersion: 1,
    shownAt: attempt.createdAt,
    kind: "prompt",
  };
  const db = new DatabaseSync(path.join(dir, "obrazownik.sqlite"));
  try {
    await migrate(db, path.join(dir, "backups"), false, migrations.slice(0, 1));
    db.prepare(
      "INSERT INTO attempts(id,revision,status,record) VALUES (?,?,?,?)",
    ).run(
      attempt.id,
      attempt.revision,
      attempt.status,
      JSON.stringify(attempt),
    );
    db.prepare(
      "INSERT INTO attemptVersions(id,attemptId,record) VALUES (?,?,?)",
    ).run(version.id, attempt.id, JSON.stringify(version));
    db.prepare(
      "INSERT INTO exposures(id,attemptId,cardId,record) VALUES (?,?,?,?)",
    ).run(exposure.id, attempt.id, attempt.cardId, JSON.stringify(exposure));
  } finally {
    db.close();
  }
  return { dir, attempt, version, exposure };
}

test("v1 migration preserves text, identifiers and dates; empty history remains unknown and backup is v1", async () => {
  const old = await legacyFixture(),
    store = await open(old.dir);
  const detail = store.detail(old.attempt.id);
  expect(detail.attempt).toMatchObject({
    ...old.attempt,
    assistanceTracking: "unknown",
    exposureTracking: "unknown",
    noveltyStatus: "unknown",
  });
  expect(detail.assistanceState).toBe("unknown");
  expect(detail.versions[0]).toMatchObject({
    ...old.version,
    assistanceStateAtCapture: "unknown",
  });
  expect(store.exportData().exposureHistory).toBe("unknown");
  const file = readdirSync(path.join(old.dir, "backups")).find((name) =>
    name.endsWith(".sqlite"),
  );
  expect(file).toBeTruthy();
  const backup = new DatabaseSync(path.join(old.dir, "backups", file!), {
    readOnly: true,
  });
  try {
    expect(backup.prepare("PRAGMA user_version").get()?.user_version).toBe(1);
    expect(
      JSON.parse(
        String(
          backup
            .prepare("SELECT record FROM attempts WHERE id=?")
            .get(old.attempt.id)?.record,
        ),
      ),
    ).toEqual(old.attempt);
  } finally {
    backup.close();
  }
});

test("export retains the original legacy exposure after reopening the same historical attempt", async () => {
  const old = await legacyFixture(),
    store = await open(old.dir);
  store.shown(old.attempt.id);
  expect(store.exportData().exposures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: old.exposure.id,
        shownAt: old.exposure.shownAt,
      }),
    ]),
  );
});

test("cross-install import preserves versions, help, unknown history and local settings; same file is idempotent", async () => {
  const old = await legacyFixture(),
    source = await open(old.dir),
    target = await open();
  source.updateSettings({
    ...source.settings(),
    fontSize: "large",
    repeatEnabled: false,
  });
  const localSettings = target.settings();
  const bundle = source.exportData(),
    preview = target.previewImport(bundle);
  const first = await target.importData(bundle, preview.digest);
  expect(first.duplicate).toBe(false);
  expect(target.getAttempt(old.attempt.id).currentText).toBe(
    old.attempt.currentText,
  );
  expect(target.detail(old.attempt.id).assistanceState).toBe("unknown");
  expect(target.exportData().exposureHistory).toBe("unknown");
  expect(target.exportData().versions[0].createdAt).toBe(old.version.createdAt);
  expect(target.settings()).toEqual(localSettings);
  expect((await target.importData(bundle, preview.digest)).duplicate).toBe(
    true,
  );
  expect(target.listAttempts()).toHaveLength(1);
});

test("merging an identical local export skips matching data instead of creating duplicate attempts", async () => {
  const store = await open();
  store.createAttempt(cards[0], randomUUID());
  const bundle = store.exportData(),
    preview = store.previewImport(bundle);
  await store.importData(bundle, preview.digest);
  expect(store.listAttempts(100)).toHaveLength(1);
});

test("ID collision remaps connected session, attempts, versions, document and review graph without overwriting", async () => {
  const source = await open(),
    target = await open();
  let attempt = source.createAttempt(cards[0], randomUUID());
  attempt = source.saveAttempt(attempt.id, {
    text: "Tekst źródłowy.\nŻółć.",
    expectedRevision: attempt.revision,
    clientMutationId: randomUUID(),
  });
  source.shown(attempt.id);
  const hint = source.prepareHint(
    attempt.id,
    {
      level: 1,
      expectedRevision: attempt.revision,
      clientMutationId: randomUUID(),
    },
    "Wskazówka syntetyczna.",
  );
  const final = source.finish(
    attempt.id,
    { expectedRevision: hint.attempt.revision, clientMutationId: randomUUID() },
    "completed",
  );
  const firstBundle = source.exportData();
  await target.importData(
    firstBundle,
    target.previewImport(firstBundle).digest,
  );
  const altered = structuredClone(firstBundle);
  altered.exportedAt = "2026-11-02T21:00:00.000Z";
  const sessionId = randomUUID(),
    documentId = randomUUID();
  altered.attempts[0].currentText = "Druga zachowana treść.";
  altered.attempts[0].sessionId = sessionId;
  altered.sessions.push({
    id: sessionId,
    startedAt: final.createdAt,
    endedAt: final.updatedAt,
    energy: null,
    status: "completed",
    attemptIds: [attempt.id],
  });
  altered.documents.push({
    id: documentId,
    title: "Własny tekst",
    currentText: "Tekst dokumentu",
    revision: 2,
    createdAt: final.createdAt,
    updatedAt: final.updatedAt,
    source: "own",
  });
  altered.documentVersions.push({
    id: randomUUID(),
    documentId,
    text: "Pierwsza wersja dokumentu",
    createdAt: final.createdAt,
    reason: "manual",
  });
  altered.reviews.push({
    id: randomUUID(),
    sourceAttemptId: attempt.id,
    offsetDays: 2,
    dueLocalDate: "2026-11-04",
    timezone: "Europe/Warsaw",
    state: "due",
    attemptId: attempt.id,
  });
  await target.importData(altered, target.previewImport(altered).digest);
  const merged = target.exportData();
  expect(merged.attempts).toHaveLength(2);
  expect(target.getAttempt(attempt.id).currentText).toBe(
    firstBundle.attempts[0].currentText,
  );
  const imported = merged.attempts.find((a) => a.id !== attempt.id)!;
  expect(imported.currentText).toBe("Druga zachowana treść.");
  const session = merged.sessions.find((s) => s.id === imported.sessionId)!;
  expect(session.attemptIds).toEqual([imported.id]);
  expect(
    merged.versions.filter((v) => v.attemptId === imported.id),
  ).toHaveLength(2);
  expect(
    merged.assistanceEvents.find((e) => e.attemptId === imported.id)?.status,
  ).toBe("prepared");
  expect(merged.reviews[0]).toMatchObject({
    sourceAttemptId: imported.id,
    attemptId: imported.id,
  });
  expect(merged.documents).toHaveLength(1);
  expect(merged.documentVersions[0].documentId).toBe(merged.documents[0].id);
  expect(
    merged.exposures.find((e) => e.attemptId === imported.id),
  ).toBeTruthy();
});

test("malformed references and changed confirmation digests are rejected without partial writes", async () => {
  const source = await open(),
    target = await open();
  source.createAttempt(cards[0], randomUUID());
  const bundle = source.exportData(),
    preview = target.previewImport(bundle);
  const changed = structuredClone(bundle);
  changed.attempts[0].currentText = "Zmieniono po podglądzie";
  await expect(target.importData(changed, preview.digest)).rejects.toThrow(
    /zmienił/,
  );
  expect(target.listAttempts()).toHaveLength(0);
  const invalid = structuredClone(bundle);
  invalid.attempts[0].sessionId = randomUUID();
  expect(() => target.previewImport(invalid)).toThrow();
  expect(target.listAttempts()).toHaveLength(0);
});

test("backup rejects symlinked destinations and path-like names, preserving the live database", async () => {
  const dir = directory(),
    store = await open(dir),
    destination = path.join(dir, "elsewhere");
  mkdirSync(destination);
  symlinkSync(destination, path.join(dir, "backups"));
  await expect(store.backup("manual")).rejects.toThrow();
  expect(readdirSync(destination)).toEqual([]);
  rmSync(path.join(dir, "backups"));
  await expect(store.backup("../escape")).rejects.toThrow();
  const name = await store.backup("manual");
  const copy = new DatabaseSync(path.join(dir, "backups", name), {
    readOnly: true,
  });
  try {
    expect(copy.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe(
      "ok",
    );
  } finally {
    copy.close();
  }
  expect(
    readFileSync(path.join(dir, "obrazownik.sqlite")).byteLength,
  ).toBeGreaterThan(0);
});

test("catalog version conflict rolls back catalog additions and all imported records", async () => {
  const source = await open(),
    target = await open();
  source.createAttempt(cards[0], randomUUID());
  const bundle = source.exportData();
  const conflict = structuredClone(bundle.methods[0]);
  conflict.title += " — zmieniona definicja tej samej wersji";
  const extra = {
    ...structuredClone(bundle.methods[0]),
    id: "review-synthetic-method",
  };
  bundle.methods = [extra, conflict, ...bundle.methods.slice(1)];
  const preview = target.previewImport(bundle);
  await expect(target.importData(bundle, preview.digest)).rejects.toThrow(
    /wersja/,
  );
  expect(target.listAttempts()).toHaveLength(0);
  expect(
    target.exportData().methods.some((method) => method.id === extra.id),
  ).toBe(false);
});
