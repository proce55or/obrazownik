import { expect, test } from "vitest";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Storage } from "../../src/server/storage.js";
import { cards } from "../../src/server/content.js";
import { migrate, migrations } from "../../src/server/migrations.js";
const temp = () => mkdtempSync(path.join(tmpdir(), "obrazownik-storage-"));

test("Unicode survives restart; request and mutation deduplicate; CAS protects two tabs", async () => {
  const dir = temp();
  let store: Storage | undefined;
  try {
    store = await Storage.open(dir);
    const requestId = randomUUID();
    const attempt = store.createAttempt(cards[0], requestId);
    expect(store.createAttempt(cards[0], requestId)).toEqual(attempt);
    const text = '  Łódź, źdźbło i żółć.\n\n"Ciepło" — bez zmiany znaków.  ';
    const input = { text, expectedRevision: 0, clientMutationId: randomUUID() };
    const saved = store.saveAttempt(attempt.id, input);
    expect(saved.revision).toBe(1);
    expect(store.saveAttempt(attempt.id, input)).toEqual(saved);
    expect(() =>
      store!.saveAttempt(attempt.id, { ...input, text: "Inny tekst" }),
    ).toThrow(/Identyfikator/);
    expect(() =>
      store!.saveAttempt(attempt.id, {
        text: "Druga karta",
        expectedRevision: 0,
        clientMutationId: randomUUID(),
      }),
    ).toThrow(/innej karcie/);
    const environmentId = store.environmentId;
    store.close();
    store = undefined;
    store = await Storage.open(dir);
    expect(store.environmentId).toBe(environmentId);
    expect(store.getAttempt(attempt.id).currentText).toBe(text);
    expect(store.saveAttempt(attempt.id, input)).toEqual(saved);
    expect(store.listAttempts()).toHaveLength(1);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("one process owns a data directory before migration", async () => {
  const dir = temp();
  let store: Storage | undefined;
  try {
    store = await Storage.open(dir);
    await expect(Storage.open(dir)).rejects.toThrow(/zablokowany/);
    expect(store.settings().schemaVersion).toBe(1);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("failed migration rolls back DDL and data, while verified backup retains prior state", async () => {
  const dir = temp();
  const db = new DatabaseSync(path.join(dir, "test.sqlite"));
  try {
    await migrate(db, path.join(dir, "backups"), false);
    db.prepare("INSERT INTO appMeta VALUES (?,?)").run(
      "synthetic-marker",
      "Zażółć\nŚlad",
    );
    await expect(
      migrate(db, path.join(dir, "backups"), true, [
        ...migrations,
        {
          version: 4,
          sql: "CREATE TABLE temporaryTest(id INT); DELETE FROM appMeta; INVALID SQL;",
        },
      ]),
    ).rejects.toThrow();
    expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(3);
    expect(
      db
        .prepare("SELECT value FROM appMeta WHERE key=?")
        .get("synthetic-marker")?.value,
    ).toBe("Zażółć\nŚlad");
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='temporaryTest'")
        .get(),
    ).toBeUndefined();
    const copy = new DatabaseSync(
      path.join(dir, "backups", readdirSync(path.join(dir, "backups"))[0]),
      { readOnly: true },
    );
    try {
      expect(
        copy
          .prepare("SELECT value FROM appMeta WHERE key=?")
          .get("synthetic-marker")?.value,
      ).toBe("Zażółć\nŚlad");
    } finally {
      copy.close();
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("corrupted and newer databases are preserved rather than reset", async () => {
  const dir = temp();
  try {
    const file = path.join(dir, "obrazownik.sqlite");
    const corrupt = Buffer.from("Syntetyczna uszkodzona baza.");
    writeFileSync(file, corrupt);
    await expect(Storage.open(dir)).rejects.toThrow();
    expect(readFileSync(file)).toEqual(corrupt);
    rmSync(file);
    const db = new DatabaseSync(file);
    db.exec(
      "PRAGMA user_version=999; CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES ('synthetic')",
    );
    db.close();
    const before = readFileSync(file);
    await expect(Storage.open(dir)).rejects.toThrow(/nowszy format/);
    expect(readFileSync(file)).toEqual(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("help preserves pre_hint, uncertain delivery stays marked, final is immutable after ratings", async () => {
  const dir = temp();
  let store: Storage | undefined;
  try {
    store = await Storage.open(dir);
    const attempt = store.createAttempt(cards[0], randomUUID());
    const initial = store.saveAttempt(attempt.id, {
      text: "Kamień jest chłodny.",
      expectedRevision: 0,
      clientMutationId: randomUUID(),
    });
    const hintInput = {
      level: 1,
      expectedRevision: initial.revision,
      clientMutationId: randomUUID(),
    };
    const prepared = store.prepareHint(
      attempt.id,
      hintInput,
      "Pytanie testowe",
    );
    expect(prepared.event.status).toBe("prepared");
    expect(store.prepareHint(attempt.id, hintInput, "Pytanie testowe")).toEqual(
      prepared,
    );
    expect(store.versions(attempt.id)[0]).toMatchObject({
      reason: "pre_hint",
      text: initial.currentText,
      assistanceLevelAtCapture: 0,
    });
    const improved = store.saveAttempt(attempt.id, {
      text: "Kamień chłodzi wnętrze dłoni.",
      expectedRevision: prepared.attempt.revision,
      clientMutationId: randomUUID(),
    });
    const finishInput = {
      expectedRevision: improved.revision,
      clientMutationId: randomUUID(),
    };
    const finished = store.finish(attempt.id, finishInput, "completed");
    expect(store.finish(attempt.id, finishInput, "completed")).toEqual(
      finished,
    );
    const final = store.versions(attempt.id).find((v) => v.reason === "final");
    expect(final).toMatchObject({
      text: improved.currentText,
      assistanceLevelAtCapture: 1,
    });
    store.rate(attempt.id, {
      expectedRevision: finished.revision,
      clientMutationId: randomUUID(),
      selfRatings: { ease: 3 },
    });
    expect(
      store.versions(attempt.id).find((v) => v.reason === "final"),
    ).toEqual(final);
    store.recover(attempt.id, {
      text: "Lokalny tekst obok wersji końcowej.",
      clientMutationId: randomUUID(),
    });
    expect(store.getAttempt(attempt.id).currentText).toBe(improved.currentText);
    store.close();
    store = undefined;
    store = await Storage.open(dir);
    expect(store.detail(attempt.id).assistanceEvents[0].status).toBe(
      "prepared",
    );
    expect(store.detail(attempt.id).versions).toHaveLength(3);
    const delivered = store.deliverHint(attempt.id, prepared.event.id);
    expect(store.deliverHint(attempt.id, prepared.event.id)).toEqual(delivered);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
