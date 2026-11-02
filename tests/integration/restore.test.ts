import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { migrate, migrations } from "../../src/server/migrations.js";
import { verifiedBackup } from "../../src/server/backup.js";
import { acquireLock } from "../../src/server/lock.js";
import {
  AttemptSchema,
  VersionSchema,
  AssistanceSchema,
} from "../../src/shared/schemas.js";
import { restoreDatabase } from "../../scripts/restore.js";

async function populate(dir: string, text: string) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "obrazownik.sqlite"));
  await migrate(db, path.join(dir, "backups"), false);
  db.exec("PRAGMA foreign_keys=ON");
  const now = new Date().toISOString();
  const attempt = AttemptSchema.parse({
    id: randomUUID(),
    sessionId: null,
    cardId: "restore-synthetic",
    cardVersion: 1,
    promptSnapshot: {
      title: "Próba odtworzenia",
      stimulus: "Kamień",
      instruction: "Zapisz własny szczegół.",
    },
    family: "property",
    partition: "training",
    mode: "training",
    status: "completed",
    revision: 3,
    currentText: text,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    sourceAttemptId: null,
    constraints: [],
    selfRatings: null,
  });
  db.prepare("INSERT INTO appMeta(key,value) VALUES (?,?)").run(
    "environmentId",
    randomUUID(),
  );
  db.prepare("INSERT INTO settings(id,record) VALUES (1,?)").run(
    JSON.stringify({
      schemaVersion: 1,
      timezone: "Europe/Warsaw",
      fontSize: "normal",
      repeatEnabled: true,
      repeatOffsetsDays: [2, 7, 21],
    }),
  );
  db.prepare(
    "INSERT INTO attempts(id,revision,status,record) VALUES (?,?,?,?)",
  ).run(attempt.id, attempt.revision, attempt.status, JSON.stringify(attempt));
  const version = VersionSchema.parse({
    id: randomUUID(),
    attemptId: attempt.id,
    text,
    reason: "final",
    createdAt: now,
    assistanceLevelAtCapture: 1,
  });
  db.prepare(
    "INSERT INTO attemptVersions(id,attemptId,record) VALUES (?,?,?)",
  ).run(version.id, attempt.id, JSON.stringify(version));
  const event = AssistanceSchema.parse({
    id: randomUUID(),
    attemptId: attempt.id,
    level: 1,
    kind: "question",
    revealedContentSnapshot: "Pytanie syntetyczne",
    requestedAt: now,
    deliveredAt: now,
    status: "delivered",
  });
  db.prepare(
    "INSERT INTO assistanceEvents(id,attemptId,record) VALUES (?,?,?)",
  ).run(event.id, attempt.id, JSON.stringify(event));
  const exposureId = randomUUID();
  db.prepare(
    "INSERT INTO exposures(id,attemptId,cardId,record) VALUES (?,?,?,?)",
  ).run(
    exposureId,
    attempt.id,
    attempt.cardId,
    JSON.stringify({
      id: exposureId,
      attemptId: attempt.id,
      cardId: attempt.cardId,
      cardVersion: 1,
      shownAt: now,
      kind: "prompt",
    }),
  );
  const filename = await verifiedBackup(db, dir, "manual");
  db.close();
  return {
    copy: path.join(dir, "backups", filename),
    attemptId: attempt.id,
    versionId: version.id,
    eventId: event.id,
  };
}
function textAt(file: string, id: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return JSON.parse(
      String(
        db.prepare("SELECT record FROM attempts WHERE id=?").get(id)?.record,
      ),
    ).currentText;
  } finally {
    db.close();
  }
}

test("real restore preserves Unicode, versions, help and relations; keeps the previous database", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "obrazownik-restore-"));
  try {
    const sourceDir = path.join(root, "source with space"),
      targetDir = path.join(root, "target with space");
    const text = '  Zażółć gęślą jaźń\n\n"Dwie linie" — bez normalizacji.  ';
    const source = await populate(sourceDir, text),
      old = await populate(targetDir, "Poprzedni tekst.");
    const result = await restoreDatabase(source.copy, targetDir);
    expect(result.verified).toBe(true);
    expect(result.schemaVersion).toBe(migrations.at(-1)?.version);
    expect(
      textAt(path.join(targetDir, "obrazownik.sqlite"), source.attemptId),
    ).toBe(text);
    expect(result.previousDatabase).toBeTruthy();
    expect(textAt(result.previousDatabase!, old.attemptId)).toBe(
      "Poprzedni tekst.",
    );
    const db = new DatabaseSync(path.join(targetDir, "obrazownik.sqlite"), {
      readOnly: true,
    });
    try {
      expect(
        db
          .prepare("SELECT attemptId FROM attemptVersions WHERE id=?")
          .get(source.versionId)?.attemptId,
      ).toBe(source.attemptId);
      expect(
        db
          .prepare("SELECT attemptId FROM assistanceEvents WHERE id=?")
          .get(source.eventId)?.attemptId,
      ).toBe(source.attemptId);
      expect(
        db
          .prepare("SELECT COUNT(*) AS n FROM exposures WHERE attemptId=?")
          .get(source.attemptId)?.n,
      ).toBe(1);
      expect(db.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe(
        "ok",
      );
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
    expect(readFileSync(source.copy).length).toBeGreaterThan(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("restore refuses a running owner, corrupt/newer copies and symbolic links without changing current data", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "obrazownik-restore-"));
  try {
    const sourceDir = path.join(root, "source"),
      targetDir = path.join(root, "target");
    const source = await populate(sourceDir, "Nowa kopia."),
      original = await populate(targetDir, "Zachowaj mnie.");
    const file = path.join(targetDir, "obrazownik.sqlite"),
      before = readFileSync(file);
    const release = acquireLock(targetDir);
    try {
      await expect(restoreDatabase(source.copy, targetDir)).rejects.toThrow(
        /zablokowany/,
      );
    } finally {
      release();
    }
    const corrupt = path.join(root, "corrupt.sqlite");
    writeFileSync(corrupt, "To nie jest SQLite.");
    await expect(restoreDatabase(corrupt, targetDir)).rejects.toThrow();
    const future = path.join(root, "future.sqlite");
    copyFileSync(source.copy, future);
    const newer = new DatabaseSync(future);
    newer.exec(`PRAGMA user_version=${Number(migrations.at(-1)?.version) + 1}`);
    newer.close();
    await expect(restoreDatabase(future, targetDir)).rejects.toThrow(
      /nowszy format/,
    );
    const link = path.join(root, "link.sqlite");
    symlinkSync(source.copy, link);
    await expect(restoreDatabase(link, targetDir)).rejects.toThrow(/dowiązań/);
    expect(readFileSync(file)).toEqual(before);
    expect(textAt(file, original.attemptId)).toBe("Zachowaj mnie.");
    const linkedTarget = path.join(root, "linked-target");
    mkdirSync(linkedTarget);
    symlinkSync(source.copy, path.join(linkedTarget, "obrazownik.sqlite"));
    await expect(restoreDatabase(source.copy, linkedTarget)).rejects.toThrow(
      /dowiązań/,
    );
    const futureTarget = path.join(root, "future-target");
    mkdirSync(futureTarget);
    const futureCurrent = path.join(futureTarget, "obrazownik.sqlite");
    copyFileSync(future, futureCurrent);
    const futureBefore = readFileSync(futureCurrent);
    await expect(restoreDatabase(source.copy, futureTarget)).rejects.toThrow(
      /nowszy format/,
    );
    expect(readFileSync(futureCurrent)).toEqual(futureBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a corrupt current database is retained and can be replaced with a verified snapshot", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "obrazownik-restore-"));
  try {
    const source = await populate(
      path.join(root, "source"),
      "Odzyskana żółć.\nDrugi wers.",
    );
    const targetDir = path.join(root, "target");
    mkdirSync(targetDir);
    const broken = Buffer.from("Uszkodzona syntetyczna baza; zachowaj plik.");
    writeFileSync(path.join(targetDir, "obrazownik.sqlite"), broken);
    const result = await restoreDatabase(source.copy, targetDir);
    expect(readFileSync(result.previousDatabase!)).toEqual(broken);
    expect(
      textAt(path.join(targetDir, "obrazownik.sqlite"), source.attemptId),
    ).toBe("Odzyskana żółć.\nDrugi wers.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
