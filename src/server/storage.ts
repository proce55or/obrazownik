import { DatabaseSync } from "node:sqlite";
import { existsSync, chmodSync, statSync, lstatSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  AttemptSchema,
  SettingsSchema,
  VersionSchema,
  AssistanceSchema,
  type Attempt,
  type Settings,
  type SaveAttempt,
  type Ratings,
  type AttemptVersion,
  type AssistanceEvent,
} from "../shared/schemas.js";
import type { Card } from "../domain/cards.js";
import { createDataDir, resolveDataDir } from "./paths.js";
import { acquireLock } from "./lock.js";
import { migrate } from "./migrations.js";
import { AppError } from "./errors.js";

export class Storage {
  private constructor(
    private db: DatabaseSync,
    private releaseLock: () => void,
    public readonly dataDir: string,
  ) {}
  static async open(input: string): Promise<Storage> {
    const dataDir = resolveDataDir(input);
    createDataDir(dataDir);
    const release = acquireLock(dataDir);
    let db: DatabaseSync | undefined;
    try {
      const file = path.join(dataDir, "obrazownik.sqlite");
      for (const suffix of ["", "-wal", "-shm", "-journal"]) {
        try {
          if (lstatSync(file + suffix).isSymbolicLink())
            throw new Error(
              "Pliki bazy nie mogą być dowiązaniami symbolicznymi.",
            );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      const existed = existsSync(file) && statSync(file).size > 0;
      db = new DatabaseSync(file);
      chmodSync(file, 0o600);
      if (db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok")
        throw new Error("Baza wymaga sprawdzenia. Nie zastąpiono jej pustą.");
      // Reject newer schemas before changing journal configuration.
      if (Number(db.prepare("PRAGMA user_version").get()!.user_version) > 1)
        throw new Error("Baza ma nowszy format. Nie zmieniono danych.");
      db.exec(
        "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;",
      );
      await migrate(db, path.join(dataDir, "backups"), existed);
      const store = new Storage(db, release, dataDir);
      store.transaction(() => {
        db!
          .prepare("INSERT OR IGNORE INTO appMeta(key,value) VALUES (?,?)")
          .run("environmentId", randomUUID());
        db!
          .prepare("INSERT OR IGNORE INTO settings(id,record) VALUES (1,?)")
          .run(
            JSON.stringify({
              schemaVersion: 1,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              fontSize: "normal",
              repeatEnabled: true,
              repeatOffsetsDays: [1, 3, 7],
            }),
          );
      });
      return store;
    } catch (error) {
      db?.close();
      release();
      throw error;
    }
  }
  close(): void {
    try {
      this.db.close();
    } finally {
      this.releaseLock();
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  mutate<T>(scope: string, id: string, payload: unknown, fn: () => T): T {
    return this.transaction(() => {
      const digest = createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");
      const previous = this.db
        .prepare("SELECT digest,result FROM mutations WHERE scope=? AND id=?")
        .get(scope, id);
      if (previous) {
        if (previous.digest !== digest)
          throw new AppError(
            409,
            "mutation_reused",
            "Identyfikator zapisu został już użyty dla innej treści.",
          );
        return JSON.parse(String(previous.result)) as T;
      }
      const result = fn();
      this.db
        .prepare(
          "INSERT INTO mutations(scope,id,digest,result) VALUES (?,?,?,?)",
        )
        .run(scope, id, digest, JSON.stringify(result));
      return result;
    });
  }
  get environmentId(): string {
    return String(
      this.db
        .prepare("SELECT value FROM appMeta WHERE key=?")
        .get("environmentId")!.value,
    );
  }
  settings(): Settings {
    return SettingsSchema.parse(
      JSON.parse(
        String(
          this.db.prepare("SELECT record FROM settings WHERE id=1").get()!
            .record,
        ),
      ),
    );
  }
  updateSettings(settings: Settings): Settings {
    const parsed = SettingsSchema.parse(settings);
    return this.transaction(() => {
      this.db
        .prepare("UPDATE settings SET record=? WHERE id=1")
        .run(JSON.stringify(parsed));
      return parsed;
    });
  }
  getAttempt(id: string): Attempt {
    const row = this.db
      .prepare("SELECT record FROM attempts WHERE id=?")
      .get(id);
    if (!row) throw new AppError(404, "not_found", "Nie znaleziono tej próby.");
    return AttemptSchema.parse(JSON.parse(String(row.record)));
  }
  listAttempts(limit = 30, offset = 0, status?: string): Attempt[] {
    const rows = status
      ? this.db
          .prepare(
            "SELECT record FROM attempts WHERE status=? ORDER BY json_extract(record,'$.updatedAt') DESC, id LIMIT ? OFFSET ?",
          )
          .all(status, limit, offset)
      : this.db
          .prepare(
            "SELECT record FROM attempts ORDER BY json_extract(record,'$.updatedAt') DESC, id LIMIT ? OFFSET ?",
          )
          .all(limit, offset);
    return rows.map((row) =>
      AttemptSchema.parse(JSON.parse(String(row.record))),
    );
  }
  createAttempt(card: Card, requestId: string): Attempt {
    return this.mutate("create-attempt", requestId, { cardId: card.id }, () => {
      const now = new Date().toISOString();
      const attempt = AttemptSchema.parse({
        id: randomUUID(),
        sessionId: null,
        cardId: card.id,
        cardVersion: card.version,
        promptSnapshot: card.prompt,
        family: card.family,
        partition: card.partition,
        mode: "training",
        status: "draft",
        revision: 0,
        currentText: "",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        sourceAttemptId: null,
        constraints: card.constraints,
        selfRatings: null,
      });
      this.db
        .prepare(
          "INSERT INTO attempts(id,revision,status,record) VALUES (?,?,?,?)",
        )
        .run(attempt.id, 0, "draft", JSON.stringify(attempt));
      return attempt;
    });
  }
  checkRevision(id: string, revision: number): Attempt {
    const attempt = this.getAttempt(id);
    if (attempt.revision !== revision)
      throw new AppError(
        409,
        "revision_conflict",
        "Ta próba zmieniła się w innej karcie. Zachowaj swój tekst i porównaj wersje.",
        false,
        attempt.revision,
      );
    return attempt;
  }
  private writeAttempt(attempt: Attempt): Attempt {
    const parsed = AttemptSchema.parse(attempt);
    this.db
      .prepare("UPDATE attempts SET revision=?, status=?, record=? WHERE id=?")
      .run(parsed.revision, parsed.status, JSON.stringify(parsed), parsed.id);
    return parsed;
  }
  saveAttempt(id: string, input: SaveAttempt): Attempt {
    return this.mutate(`save:${id}`, input.clientMutationId, input, () => {
      const attempt = this.checkRevision(id, input.expectedRevision);
      if (attempt.status !== "draft")
        throw new AppError(
          409,
          "attempt_closed",
          "Ta próba jest już zamknięta. Zachowaj tekst jako osobną wersję.",
        );
      return this.writeAttempt({
        ...attempt,
        currentText: input.text,
        revision: attempt.revision + 1,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  versions(id: string) {
    return this.db
      .prepare(
        "SELECT record FROM attemptVersions WHERE attemptId=? ORDER BY rowid",
      )
      .all(id)
      .map((r) => VersionSchema.parse(JSON.parse(String(r.record))));
  }
  assistance(id: string) {
    return this.db
      .prepare(
        "SELECT record FROM assistanceEvents WHERE attemptId=? ORDER BY rowid",
      )
      .all(id)
      .map((r) => AssistanceSchema.parse(JSON.parse(String(r.record))));
  }
  detail(id: string) {
    return {
      attempt: this.getAttempt(id),
      versions: this.versions(id),
      assistanceEvents: this.assistance(id),
    };
  }
  private capture(
    attempt: Attempt,
    reason: AttemptVersion["reason"],
    text = attempt.currentText,
  ): AttemptVersion {
    const version = VersionSchema.parse({
      id: randomUUID(),
      attemptId: attempt.id,
      text,
      createdAt: new Date().toISOString(),
      reason,
      assistanceLevelAtCapture: Math.max(
        0,
        ...this.assistance(attempt.id)
          .filter((e) => e.status !== "failed")
          .map((e) => e.level),
      ),
    });
    this.db
      .prepare(
        "INSERT INTO attemptVersions(id,attemptId,record) VALUES (?,?,?)",
      )
      .run(version.id, attempt.id, JSON.stringify(version));
    return version;
  }
  shown(id: string) {
    return this.transaction(() => {
      const attempt = this.getAttempt(id);
      const exposure = {
        id: randomUUID(),
        attemptId: id,
        cardId: attempt.cardId,
        cardVersion: attempt.cardVersion,
        shownAt: new Date().toISOString(),
        kind: "prompt",
      };
      this.db
        .prepare(
          "INSERT OR IGNORE INTO exposures(id,attemptId,cardId,record) VALUES (?,?,?,?)",
        )
        .run(exposure.id, id, attempt.cardId, JSON.stringify(exposure));
      return { shown: true };
    });
  }
  prepareHint(
    id: string,
    input: {
      level: number;
      expectedRevision: number;
      clientMutationId: string;
    },
    content: string,
  ) {
    return this.mutate(`hint:${id}`, input.clientMutationId, input, () => {
      const attempt = this.checkRevision(id, input.expectedRevision);
      if (attempt.mode === "independent" || attempt.status !== "draft")
        throw new AppError(
          409,
          "hint_unavailable",
          "Pomoc jest dostępna wyłącznie w otwartym ćwiczeniu treningowym.",
        );
      const prior = this.assistance(id).find(
        (e) => e.level === input.level && e.status !== "failed",
      );
      if (prior) return { attempt, event: prior };
      this.capture(attempt, "pre_hint");
      const event = AssistanceSchema.parse({
        id: randomUUID(),
        attemptId: id,
        level: input.level,
        kind: ["question", "direction", "example"][input.level - 1],
        revealedContentSnapshot: content,
        requestedAt: new Date().toISOString(),
        deliveredAt: null,
        status: "prepared",
      });
      this.db
        .prepare(
          "INSERT INTO assistanceEvents(id,attemptId,record) VALUES (?,?,?)",
        )
        .run(event.id, id, JSON.stringify(event));
      return {
        attempt: this.writeAttempt({
          ...attempt,
          revision: attempt.revision + 1,
          updatedAt: new Date().toISOString(),
        }),
        event,
      };
    });
  }
  deliverHint(id: string, eventId: string): AssistanceEvent {
    return this.transaction(() => {
      const event = this.assistance(id).find((e) => e.id === eventId);
      if (!event)
        throw new AppError(404, "not_found", "Nie znaleziono podpowiedzi.");
      if (event.status === "delivered") return event;
      const delivered = AssistanceSchema.parse({
        ...event,
        status: "delivered",
        deliveredAt: new Date().toISOString(),
      });
      this.db
        .prepare("UPDATE assistanceEvents SET record=? WHERE id=?")
        .run(JSON.stringify(delivered), eventId);
      return delivered;
    });
  }
  finish(
    id: string,
    input: { expectedRevision: number; clientMutationId: string },
    status: "completed" | "skipped",
  ) {
    return this.mutate(
      `finish:${id}`,
      input.clientMutationId,
      { ...input, status },
      () => {
        const attempt = this.checkRevision(id, input.expectedRevision);
        if (attempt.status !== "draft")
          throw new AppError(
            409,
            "attempt_closed",
            "Ta próba została już zamknięta.",
          );
        const now = new Date().toISOString();
        if (status === "completed") this.capture(attempt, "final");
        return this.writeAttempt({
          ...attempt,
          status,
          completedAt: status === "completed" ? now : null,
          updatedAt: now,
          revision: attempt.revision + 1,
        });
      },
    );
  }
  rate(
    id: string,
    input: {
      expectedRevision: number;
      clientMutationId: string;
      selfRatings: Ratings;
    },
  ) {
    return this.mutate(`rate:${id}`, input.clientMutationId, input, () => {
      const attempt = this.checkRevision(id, input.expectedRevision);
      if (attempt.status !== "completed")
        throw new AppError(
          409,
          "not_completed",
          "Samoocenę możesz dodać po zapisaniu ćwiczenia.",
        );
      return this.writeAttempt({
        ...attempt,
        selfRatings: input.selfRatings,
        revision: attempt.revision + 1,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  recover(id: string, input: { text: string; clientMutationId: string }) {
    return this.mutate(`recover:${id}`, input.clientMutationId, input, () =>
      this.capture(this.getAttempt(id), "recovery", input.text),
    );
  }
}
