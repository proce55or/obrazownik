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
import { GuidedFeedbackSchema, GuidedReviewSchema, hasGuidedIdentity, isGuidedFeedbackCurrent, type GuidedFeedback, type GuidedStep } from "../shared/guided.js";
import { LocalLlmProvenanceSchema, type LocalLlmProvenance } from "../shared/llm-provenance.js";
import { guidedCard, guidedMethod } from "./guided-content.js";
import { assistanceState } from "../domain/assistance.js";
import { methods, getMethod, getCard } from "./content.js";
import { verifiedBackup } from "./backup.js";
import { CardSchema, type Card } from "../domain/cards.js";
import { createDataDir, resolveDataDir } from "./paths.js";
import { acquireLock } from "./lock.js";
import { migrations, migrate } from "./migrations.js";
import { BundleSchema } from "../shared/bundle.js";
import {
  exportBundle,
  importBundle,
  importPreview,
  previewWithDatabase,
  assertBundleSize,
} from "./transfer.js";
import { SessionSchema, ReviewSchema } from "../shared/records.js";
import { localDay, addCalendarDays, choose } from "../domain/schedule.js";
import { pruneAutomaticBackups, listBackups } from "./backup-policy.js";
import {
  Notebook,
  type NotebookQuery,
  CreateDocumentSchema,
  SaveDocumentSchema,
  DocumentVersionRequestSchema,
} from "./notebook.js";
import { z } from "zod";
import { AppError } from "./errors.js";

function latestCards(pool: Card[]): Card[] {
  const latest = new Map<string, Card>();
  for (const card of pool)
    if (!latest.has(card.id) || latest.get(card.id)!.version < card.version)
      latest.set(card.id, card);
  return [...latest.values()];
}

export class Storage {
  private notebook!: Notebook;
  private dailyBackups = new Map<string, Promise<void>>();
  private constructor(
    private db: DatabaseSync,
    private releaseLock: () => void,
    public readonly dataDir: string,
    private clock: () => Date = () => new Date(),
    private random: () => number = Math.random,
  ) {}
  static async open(
    input: string,
    options: { clock?: () => Date; random?: () => number } = {},
  ): Promise<Storage> {
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
      if (
        Number(db.prepare("PRAGMA user_version").get()!.user_version) >
        migrations.at(-1)!.version
      )
        throw new Error("Baza ma nowszy format. Nie zmieniono danych.");
      db.exec(
        "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;",
      );
      await migrate(db, path.join(dataDir, "backups"), existed);
      const store = new Storage(
        db,
        release,
        dataDir,
        options.clock,
        options.random,
      );
      store.notebook = new Notebook(db);
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
              repeatOffsetsDays: [2, 7, 21],
            }),
          );
      });
      store.transaction(() => {
        for (const method of methods)
          db!
            .prepare("INSERT OR IGNORE INTO methods(key,record) VALUES (?,?)")
            .run(`${method.id}:${method.version}`, JSON.stringify(method));
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
  createAttempt(
    card: Card,
    requestId: string,
    options: { variant?: "standard" | "easy"; useConstraint?: boolean } = {},
  ): Attempt {
    return this.mutate(
      "create-attempt",
      requestId,
      (!options.variant || options.variant === "standard") &&
        !options.useConstraint
        ? { cardId: card.id }
        : {
            cardId: card.id,
            variant: options.variant ?? "standard",
            useConstraint: options.useConstraint ?? false,
          },
      () => this.insertAttempt(card, options),
    );
  }
  createGuided(requestId: string) {
    return this.mutate("guided-start", requestId, { clientRequestId: requestId }, () => {
      this.db.prepare("INSERT OR IGNORE INTO methods(key,record) VALUES (?,?)")
        .run(`${guidedMethod.id}:${guidedMethod.version}`, JSON.stringify(guidedMethod));
      const attempt = this.insertAttempt(guidedCard);
      this.writeAttempt({ ...attempt, llmMode: "bielik", methodSnapshot: guidedMethod,
        guided: { version: 1, step: 0, feedback: null, history: [] } });
      return this.detail(attempt.id);
    });
  }
  checkGuided(id: string, revision: number): Attempt {
    const attempt = this.checkRevision(id, revision);
    if (!hasGuidedIdentity(attempt))
      throw new AppError(403, "guided_unavailable", "Ta próba nie jest ćwiczeniem prowadzonym z Bielikiem.");
    if (attempt.status !== "draft")
      throw new AppError(409, "attempt_closed", "To ćwiczenie zostało już zakończone.");
    return attempt;
  }
  prepareGuidedFeedback(
    id: string,
    input: {expectedRevision: number; clientMutationId: string},
    answer: string,
    result: {feedback: GuidedFeedback; llm: LocalLlmProvenance},
  ) {
    return this.mutate(`guided-feedback:${id}`, input.clientMutationId, input, () => {
      const attempt = this.checkGuided(id, input.expectedRevision);
      if (attempt.currentText !== answer)
        throw new AppError(409, "guided_answer_changed", "Odpowiedź zmieniła się podczas czytania. Poproś Bielika o nową informację zwrotną.");
      const feedback = GuidedFeedbackSchema.parse(result.feedback);
      const llm = LocalLlmProvenanceSchema.parse(result.llm);
      if (!answer.trim() || !answer.includes(feedback.quote))
        throw new AppError(502, "guided_invalid_feedback", "Bielik nie odniósł się poprawnie do Twojej odpowiedzi. Tekst jest zapisany; spróbuj ponownie.", true);
      // Preserve the exact response before any model assistance becomes visible.
      this.capture(attempt, "pre_hint");
      const event = AssistanceSchema.parse({
        id: randomUUID(), attemptId: id, level: 1, kind: "guided_feedback",
        provider: "bielik_local", llm,
        revealedContentSnapshot: JSON.stringify(feedback),
        requestedAt: this.clock().toISOString(), deliveredAt: null, status: "prepared",
      });
      this.db.prepare("INSERT INTO assistanceEvents(id,attemptId,record) VALUES (?,?,?)")
        .run(event.id, id, JSON.stringify(event));
      const review = GuidedReviewSchema.parse({
        step: attempt.guided!.step, answer, answerRevision: attempt.revision,
        feedback, eventId: event.id, llm,
      });
      this.writeAttempt({ ...attempt, revision: attempt.revision + 1,
        updatedAt: this.clock().toISOString(), guided: { ...attempt.guided!, feedback: review } });
      return this.detail(id);
    });
  }
  nextGuided(id: string, input: {expectedRevision: number; clientMutationId: string}) {
    return this.mutate(`guided-next:${id}`, input.clientMutationId, input, () => {
      const attempt = this.checkGuided(id, input.expectedRevision), guided = attempt.guided!;
      if (guided.step === 2)
        throw new AppError(409, "guided_last_step", "To ostatni etap. Możesz zakończyć ćwiczenie.");
      if (!isGuidedFeedbackCurrent(attempt))
        throw new AppError(409, "guided_feedback_required", "Najpierw poproś Bielika o przeczytanie aktualnej odpowiedzi.");
      this.capture(attempt, "manual");
      this.writeAttempt({ ...attempt, currentText: "", revision: attempt.revision + 1,
        updatedAt: this.clock().toISOString(), guided: {
          version: 1, step: (guided.step + 1) as GuidedStep,
          feedback: null, history: [...guided.history, guided.feedback!],
        } });
      return this.detail(id);
    });
  }
  private insertAttempt(
    card: Card,
    options: {
      variant?: "standard" | "easy";
      useConstraint?: boolean;
      mode?: Attempt["mode"];
      sessionId?: string;
      sourceAttemptId?: string;
      noveltyStatus?: Attempt["noveltyStatus"];
    } = {},
  ): Attempt {
    this.db
      .prepare("INSERT OR IGNORE INTO cardRegistry(key,record) VALUES (?,?)")
      .run(
        `${card.id}:${card.version}`,
        JSON.stringify(CardSchema.strip().parse(card)),
      );
    const now = this.clock().toISOString();
    const attempt = AttemptSchema.parse({
      id: randomUUID(),
      sessionId: options.sessionId ?? null,
      cardId: card.id,
      cardVersion: card.version,
      promptSnapshot: {
        ...card.prompt,
        instruction:
          options.variant === "easy"
            ? card.easierInstruction
            : card.prompt.instruction,
      },
      family: card.family,
      partition: card.partition,
      mode: options.mode ?? "training",
      llmMode: options.mode === "independent" ? "off" : this.settings().llmMode,
      status: "draft",
      revision: 0,
      currentText: "",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      sourceAttemptId: options.sourceAttemptId ?? null,
      constraints: [
        ...card.constraints,
        ...(options.useConstraint && card.optionalConstraint
          ? [card.optionalConstraint]
          : []),
      ],
      selfRatings: null,
      assistanceTracking: "known",
      exposureTracking: "known",
      methodId: card.methodId,
      methodVersion: card.methodVersion,
      methodSnapshot: getMethod(card.methodId, card.methodVersion) ?? null,
      itemFamilyId: card.itemFamilyId,
      setRole: card.setRole,
      responseMode: card.responseMode,
      noveltyStatus: options.noveltyStatus ?? "seen",
      scaffolding: {},
      sourceText: card.sourceText ?? null,
      scaffoldSlots:
        card.slots ?? getMethod(card.methodId, card.methodVersion)?.slots ?? [],
    });
    this.db
      .prepare(
        "INSERT INTO attempts(id,revision,status,record) VALUES (?,?,?,?)",
      )
      .run(attempt.id, 0, "draft", JSON.stringify(attempt));
    if (attempt.sourceText !== null) {
      this.capture(attempt, "pre_hint");
      const event = AssistanceSchema.parse({
        id: randomUUID(),
        attemptId: attempt.id,
        level: 1,
        kind: "word_bank",
        provider: "curated",
        revealedContentSnapshot:
          "Materiał źródłowy zachowany w sourceText tej próby.",
        requestedAt: now,
        deliveredAt: null,
        status: "prepared",
      });
      this.db
        .prepare(
          "INSERT INTO assistanceEvents(id,attemptId,record) VALUES (?,?,?)",
        )
        .run(event.id, attempt.id, JSON.stringify(event));
    }
    return attempt;
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
        scaffolding: input.scaffolding ?? attempt.scaffolding,
        revision: attempt.revision + 1,
        updatedAt: this.clock().toISOString(),
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
      assistanceState: assistanceState(
        this.getAttempt(id),
        this.assistance(id),
      ),
    };
  }
  private capture(
    attempt: Attempt,
    reason: AttemptVersion["reason"],
    text = attempt.currentText,
    fields = attempt.scaffolding,
  ): AttemptVersion {
    const version = VersionSchema.parse({
      id: randomUUID(),
      attemptId: attempt.id,
      text,
      createdAt: this.clock().toISOString(),
      reason,
      assistanceStateAtCapture: assistanceState(
        attempt,
        this.assistance(attempt.id),
      ),
      scaffolding: fields,
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
        shownAt: this.clock().toISOString(),
        kind: "prompt",
      };
      this.db
        .prepare(
          "INSERT OR IGNORE INTO exposures(id,attemptId,cardId,record) VALUES (?,?,?,?)",
        )
        .run(exposure.id, id, attempt.cardId, JSON.stringify(exposure));
      this.db
        .prepare(
          "INSERT OR IGNORE INTO contentExposure(id,cardId,cardVersion,itemFamilyId,attemptId,kind,shownAt) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          attempt.id,
          attempt.cardId,
          attempt.cardVersion,
          attempt.itemFamilyId,
          id,
          "prompt",
          exposure.shownAt,
        );
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
      if (attempt.guided || attempt.mode === "independent" || attempt.status !== "draft")
        throw new AppError(
          409,
          "hint_unavailable",
          "Pomoc jest dostępna wyłącznie w otwartym ćwiczeniu treningowym.",
        );
      const prior = this.assistance(id).find(
        (e) =>
          e.level === input.level &&
          e.kind !== "word_bank" &&
          e.provider !== "bielik_local" &&
          e.status !== "failed",
      );
      if (prior) return { attempt, event: prior };
      this.capture(attempt, "pre_hint");
      const event = AssistanceSchema.parse({
        id: randomUUID(),
        attemptId: id,
        level: input.level,
        kind: ["question", "direction", "example"][input.level - 1],
        revealedContentSnapshot: content,
        requestedAt: this.clock().toISOString(),
        deliveredAt: null,
        status: "prepared",
        provider: "curated",
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
          updatedAt: this.clock().toISOString(),
        }),
        event,
      };
    });
  }
  prepareLlmHint(
    id: string,
    input: { expectedRevision: number; clientMutationId: string },
    content: string,
    llm: NonNullable<AssistanceEvent["llm"]>,
  ) {
    return this.mutate(`llm-hint:${id}`, input.clientMutationId, input, () => {
      const attempt = this.checkRevision(id, input.expectedRevision);
      if (
        attempt.guided ||
        attempt.mode === "independent" ||
        attempt.llmMode !== "bielik" ||
        attempt.status !== "draft"
      )
        throw new AppError(
          403,
          "llm_disabled",
          "Ta próba nie korzysta z lokalnego modelu.",
        );
      const prior = this.assistance(id).find(
        (e) => e.provider === "bielik_local" && e.status !== "failed",
      );
      if (prior) return { attempt, event: prior };
      this.capture(attempt, "pre_hint");
      const event = AssistanceSchema.parse({
        id: randomUUID(),
        attemptId: id,
        level: 1,
        kind: "question",
        provider: "bielik_local",
        llm,
        revealedContentSnapshot: content,
        requestedAt: this.clock().toISOString(),
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
          updatedAt: this.clock().toISOString(),
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
        deliveredAt: this.clock().toISOString(),
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
        if (status === "completed" && attempt.guided &&
          (!hasGuidedIdentity(attempt) || attempt.guided.step !== 2 || !isGuidedFeedbackCurrent(attempt)))
          throw new AppError(409, "guided_incomplete", "Dokończ trzy etapy i poproś Bielika o przeczytanie ostatniej odpowiedzi.");
        const now = this.clock().toISOString();
        if (status === "completed") this.capture(attempt, "final");
        this.updateReviews(attempt, status);
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
        updatedAt: this.clock().toISOString(),
      });
    });
  }
  recover(
    id: string,
    input: {
      text: string;
      clientMutationId: string;
      scaffolding?: Record<string, string>;
    },
  ) {
    return this.mutate(`recover:${id}`, input.clientMutationId, input, () =>
      this.capture(
        this.getAttempt(id),
        "recovery",
        input.text,
        input.scaffolding ?? {},
      ),
    );
  }
  backup(kind = "manual") {
    return verifiedBackup(this.db, this.dataDir, kind);
  }
  previewCards(cards: Card[]): void {
    this.transaction(() => {
      for (const card of cards) {
        this.db
          .prepare(
            "INSERT OR IGNORE INTO cardRegistry(key,record) VALUES (?,?)",
          )
          .run(`${card.id}:${card.version}`, JSON.stringify(card));
        const id = `preview:${card.id}:${card.version}`;
        this.db
          .prepare(
            "INSERT OR IGNORE INTO contentExposure(id,cardId,cardVersion,itemFamilyId,attemptId,kind,shownAt) VALUES (?,?,?,?,?,?,?)",
          )
          .run(
            id,
            card.id,
            card.version,
            card.itemFamilyId,
            null,
            "preview",
            this.clock().toISOString(),
          );
      }
    });
  }

  exportData() {
    return exportBundle(this.db, this.settings());
  }
  previewImport(input: unknown) {
    return previewWithDatabase(this.db, input);
  }
  async importData(input: unknown, digest: string) {
    assertBundleSize(input);
    const bundle = BundleSchema.parse(input);
    const preview = importPreview(bundle);
    if (preview.digest !== digest)
      throw new AppError(
        409,
        "import_changed",
        "Plik zmienił się od podglądu.",
      );
    await this.backup("before-import");
    return this.transaction(() => importBundle(this.db, bundle));
  }
  replayMutation(
    scope: string,
    id: string,
    payload: unknown,
  ): unknown | undefined {
    const row = this.db
      .prepare("SELECT digest,result FROM mutations WHERE scope=? AND id=?")
      .get(scope, id);
    if (!row) return undefined;
    const digest = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    if (row.digest !== digest)
      throw new AppError(
        409,
        "mutation_reused",
        "Identyfikator zapisu został użyty dla innych danych.",
      );
    return JSON.parse(String(row.result));
  }

  private unseen(card: Card): boolean {
    return (
      !this.db
        .prepare(
          "SELECT 1 FROM contentExposure WHERE itemFamilyId=? OR cardId=? LIMIT 1",
        )
        .get(card.itemFamilyId, card.id) &&
      !this.db
        .prepare(
          "SELECT 1 FROM attempts WHERE json_extract(record,'$.itemFamilyId')=? OR json_extract(record,'$.cardId')=? LIMIT 1",
        )
        .get(card.itemFamilyId, card.id)
    );
  }
  independentStatus(pool: Card[]) {
    return {
      remaining: new Set(
        pool
          .filter((c) => c.setRole === "independent_writing" && this.unseen(c))
          .map((c) => c.itemFamilyId),
      ).size,
      history: String(
        this.db
          .prepare("SELECT value FROM appMeta WHERE key='exposureHistory'")
          .get()?.value ?? "unknown",
      ),
    };
  }
  createIndependent(
    pool: Card[],
    requestId: string,
    role: "independent_writing" | "near_transfer" = "independent_writing",
  ): Attempt {
    return this.mutate(`independent:${role}`, requestId, { role }, () => {
      const candidates = latestCards(pool).filter(
        (c) => c.setRole === role && this.unseen(c),
      );
      const card = choose(candidates, this.random);
      if (!card)
        throw new AppError(
          409,
          "reserve_exhausted",
          "Wyczerpano nowe tematy w tym zbiorze. Wcześniejsze teksty nadal są dostępne w zeszycie. Dodaj nową zredagowaną paczkę, zamiast powtarzać temat jako nowy.",
        );
      const history = this.db
        .prepare("SELECT value FROM appMeta WHERE key='exposureHistory'")
        .get()?.value;
      const attempt = this.insertAttempt(card, {
        mode: role === "independent_writing" ? "independent" : "training",
        noveltyStatus: history === "known" ? "new_confirmed" : "unknown",
      });
      this.db
        .prepare(
          "INSERT INTO contentExposure(id,cardId,cardVersion,itemFamilyId,attemptId,kind,shownAt) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          card.id,
          card.version,
          card.itemFamilyId,
          attempt.id,
          "reserved",
          this.clock().toISOString(),
        );
      return attempt;
    });
  }
  assistedCopy(
    id: string,
    input: { expectedRevision: number; clientMutationId: string },
  ) {
    return this.mutate(`assisted:${id}`, input.clientMutationId, input, () => {
      const source = this.checkRevision(id, input.expectedRevision);
      if (source.mode !== "independent" || source.status !== "draft")
        throw new AppError(
          409,
          "not_independent",
          "Ta próba nie jest otwartym nowym pisaniem.",
        );
      this.capture(source, "manual");
      this.writeAttempt({
        ...source,
        status: "abandoned",
        revision: source.revision + 1,
        updatedAt: this.clock().toISOString(),
      });
      const now = this.clock().toISOString(),
        copy = AttemptSchema.parse({
          ...source,
          id: randomUUID(),
          sessionId: null,
          mode: "training",
          llmMode: this.settings().llmMode,
          sourceAttemptId: id,
          revision: 0,
          createdAt: now,
          updatedAt: now,
          noveltyStatus: "seen",
          assistanceTracking: "known",
        });
      this.db
        .prepare(
          "INSERT INTO attempts(id,revision,status,record) VALUES (?,?,?,?)",
        )
        .run(copy.id, 0, "draft", JSON.stringify(copy));
      return {
        attempt: copy,
        versions: [],
        assistanceEvents: [],
        assistanceState: "none_confirmed" as const,
      };
    });
  }

  private updateReviews(attempt: Attempt, status: "completed" | "skipped") {
    // Guided sessions are restarted explicitly; automatic repeats use standard cards.
    if (attempt.guided) return;
    const settings = this.settings();
    const firstCompletedRepeat =
      attempt.mode === "repeat" &&
      !!attempt.sourceAttemptId &&
      !this.db
        .prepare(
          "SELECT 1 FROM attempts WHERE status='completed' AND id<>? AND (json_extract(record,'$.cardId')=? OR json_extract(record,'$.itemFamilyId')=?) LIMIT 1",
        )
        .get(attempt.id, attempt.cardId, attempt.itemFamilyId);
    if (
      status === "completed" &&
      attempt.setRole === "training" &&
      ((attempt.mode === "training" && !attempt.sourceAttemptId) ||
        firstCompletedRepeat) &&
      settings.repeatEnabled
    ) {
      for (const offset of settings.repeatOffsetsDays) {
        const exists = this.db
          .prepare(
            "SELECT 1 FROM dueReviews WHERE sourceAttemptId=? AND json_extract(record,'$.offsetDays')=?",
          )
          .get(attempt.id, offset);
        if (exists) continue;
        const review = ReviewSchema.parse({
          id: randomUUID(),
          sourceAttemptId: attempt.id,
          offsetDays: offset,
          dueLocalDate: addCalendarDays(
            localDay(this.clock(), settings.timezone),
            offset,
          ),
          timezone: settings.timezone,
          state: "due",
          attemptId: null,
        });
        this.db
          .prepare(
            "INSERT INTO dueReviews(id,sourceAttemptId,record) VALUES (?,?,?)",
          )
          .run(review.id, attempt.id, JSON.stringify(review));
      }
    }
    if (attempt.mode === "repeat")
      for (const row of this.db
        .prepare(
          "SELECT id,record FROM dueReviews WHERE json_extract(record,'$.attemptId')=?",
        )
        .all(attempt.id)) {
        const review = ReviewSchema.parse(JSON.parse(String(row.record)));
        this.db.prepare("UPDATE dueReviews SET record=? WHERE id=?").run(
          JSON.stringify({
            ...review,
            state: status === "completed" ? "completed" : "skipped",
          }),
          review.id,
        );
      }
  }

  lookupCard(id: string, version: number): Card | undefined {
    const current = getCard(id, version);
    if (current) return CardSchema.strip().parse(current);
    const row = this.db
      .prepare("SELECT record FROM cardRegistry WHERE key=?")
      .get(`${id}:${version}`);
    return row
      ? CardSchema.strip().parse(JSON.parse(String(row.record)))
      : undefined;
  }
  private async dailyBackup(ended: Date) {
    const day = localDay(ended, this.settings().timezone),
      key = `auto-backup:${day}`;
    if (this.db.prepare("SELECT 1 FROM appMeta WHERE key=?").get(key)) return;
    let pending = this.dailyBackups.get(day);
    if (!pending) {
      pending = (async () => {
        const filename = await this.backup(`auto-${day}`);
        this.db
          .prepare("INSERT OR IGNORE INTO appMeta(key,value) VALUES (?,?)")
          .run(key, filename);
        pruneAutomaticBackups(this.dataDir);
      })();
      this.dailyBackups.set(day, pending);
    }
    try {
      await pending;
    } finally {
      if (this.dailyBackups.get(day) === pending) this.dailyBackups.delete(day);
    }
  }
  getSession(id: string) {
    const row = this.db
      .prepare("SELECT record FROM sessions WHERE id=?")
      .get(id);
    if (!row) throw new AppError(404, "not_found", "Nie znaleziono sesji.");
    return SessionSchema.parse(JSON.parse(String(row.record)));
  }
  activeSession() {
    const row = this.db
      .prepare(
        "SELECT record FROM sessions WHERE json_extract(record,'$.status')='active' ORDER BY rowid DESC LIMIT 1",
      )
      .get();
    return row ? SessionSchema.parse(JSON.parse(String(row.record))) : null;
  }
  reviews() {
    if (!this.settings().repeatEnabled) return [];
    const today = localDay(this.clock(), this.settings().timezone);
    return this.db
      .prepare(
        "SELECT record FROM dueReviews WHERE json_extract(record,'$.state')='due' AND json_extract(record,'$.dueLocalDate')<=? ORDER BY json_extract(record,'$.dueLocalDate'),id LIMIT 100",
      )
      .all(today)
      .map((r) => ReviewSchema.parse(JSON.parse(String(r.record))));
  }
  createSession(
    pool: Card[],
    input: {
      clientRequestId: string;
      energy?: "low" | "medium" | "high";
      family?: Attempt["family"];
    },
  ) {
    return this.mutate("session-create", input.clientRequestId, input, () => {
      const active = this.activeSession();
      if (active) return active;
      const id = randomUUID(),
        now = this.clock().toISOString(),
        ids: string[] = [];
      const eligible = pool.filter(
        (c) =>
          c.setRole === "training" &&
          (!input.family || c.family === input.family),
      );
      const previous = (card: Card) =>
        this.db
          .prepare(
            "SELECT record FROM attempts WHERE json_extract(record,'$.cardId')=? OR json_extract(record,'$.itemFamilyId')=? ORDER BY json_extract(record,'$.updatedAt') DESC,rowid DESC LIMIT 1",
          )
          .get(card.id, card.itemFamilyId);
      const fresh = eligible.filter((c) => !previous(c));
      // Empty abandoned sessions do not consume the practice pool. A seen card
      // still stays seen; exposure records and protected reserves never reset.
      const repeats = eligible
        .filter((c) => previous(c))
        .sort((a, b) => {
          const aa = AttemptSchema.parse(
            JSON.parse(String(previous(a)!.record)),
          );
          const bb = AttemptSchema.parse(
            JSON.parse(String(previous(b)!.record)),
          );
          const empty = (x: Attempt) =>
            x.status === "abandoned" &&
            !x.currentText.trim() &&
            !Object.values(x.scaffolding).some((v) => v.trim());
          return (
            Number(empty(bb)) - Number(empty(aa)) ||
            aa.updatedAt.localeCompare(bb.updatedAt) ||
            a.id.localeCompare(b.id)
          );
        });
      const selected: Card[] = [];
      for (let i = 0; i < 2; i++) {
        const unused = (c: Card) =>
          !selected.some(
            (old) => old.id === c.id || old.itemFamilyId === c.itemFamilyId,
          );
        const card =
          choose(fresh.filter(unused), this.random) ?? repeats.find(unused);
        if (!card) break;
        const old = previous(card);
        const source = old
          ? AttemptSchema.parse(JSON.parse(String(old.record)))
          : undefined;
        const attempt = this.insertAttempt(card, {
          sessionId: id,
          ...(source
            ? {
                mode: "repeat" as const,
                sourceAttemptId: source.id,
                noveltyStatus: "seen" as const,
              }
            : {}),
        });
        ids.push(attempt.id);
        selected.push(card);
      }
      const today = localDay(this.clock(), this.settings().timezone),
        key = `review-suggested:${today}`;
      if (!this.db.prepare("SELECT 1 FROM appMeta WHERE key=?").get(key)) {
        for (const review of this.reviews().filter((r) => !r.attemptId)) {
          const source = this.getAttempt(review.sourceAttemptId),
            card = this.lookupCard(source.cardId, source.cardVersion);
          if (
            !card ||
            selected.some(
              (c) => c.id === card.id || c.itemFamilyId === card.itemFamilyId,
            )
          )
            continue;
          const next = this.insertAttempt(card, {
            mode: "repeat",
            sessionId: id,
            sourceAttemptId: source.id,
            noveltyStatus: "seen",
          });
          this.writeAttempt({
            ...next,
            promptSnapshot: source.promptSnapshot,
            methodSnapshot: source.methodSnapshot,
            sourceText: source.sourceText,
            sourceDocumentId: source.sourceDocumentId,
          });
          ids.push(next.id);
          this.db
            .prepare("UPDATE dueReviews SET record=? WHERE id=?")
            .run(JSON.stringify({ ...review, attemptId: next.id }), review.id);
          this.db
            .prepare("INSERT OR IGNORE INTO appMeta(key,value) VALUES (?,?)")
            .run(key, "shown");
          break;
        }
      }

      if (!ids.length)
        throw new AppError(
          409,
          "no_session_cards",
          "Brak dostępnych ćwiczeń dla tego wyboru. Wybierz inną rodzinę albo otwórz tekst z zeszytu.",
        );
      const session = SessionSchema.parse({
        id,
        startedAt: now,
        endedAt: null,
        energy: input.energy ?? null,
        status: "active",
        attemptIds: ids,
      });
      this.db
        .prepare("INSERT INTO sessions(id,record) VALUES (?,?)")
        .run(id, JSON.stringify(session));
      return session;
    });
  }
  async endSession(
    id: string,
    input: { clientMutationId: string; status: "completed" | "abandoned" },
  ) {
    const session = this.mutate(
      `session-end:${id}`,
      input.clientMutationId,
      input,
      () => {
        const old = this.getSession(id);
        if (old.status !== "active") return old;
        for (const attemptId of old.attemptIds) {
          const attempt = this.getAttempt(attemptId);
          if (attempt.status === "draft") {
            this.writeAttempt({
              ...attempt,
              status: "abandoned",
              revision: attempt.revision + 1,
              updatedAt: this.clock().toISOString(),
            });
            if (attempt.mode === "repeat")
              for (const row of this.db
                .prepare(
                  "SELECT id,record FROM dueReviews WHERE json_extract(record,'$.attemptId')=?",
                )
                .all(attemptId)) {
                const r = JSON.parse(String(row.record));
                this.db
                  .prepare("UPDATE dueReviews SET record=? WHERE id=?")
                  .run(
                    JSON.stringify({ ...r, state: "skipped" }),
                    String(row.id),
                  );
              }
          }
        }
        const next = {
          ...old,
          status: input.status,
          endedAt: this.clock().toISOString(),
        };
        this.db
          .prepare("UPDATE sessions SET record=? WHERE id=?")
          .run(JSON.stringify(next), id);
        return next;
      },
    );
    if (session.status === "completed")
      await this.dailyBackup(new Date(session.endedAt!));
    return session;
  }
  backupList() {
    return listBackups(this.dataDir);
  }

  notebookAttempts(query: Partial<NotebookQuery>) {
    return this.notebook.listAttempts(query);
  }
  listDocuments(query: { query?: string; limit?: number; offset?: number }) {
    return this.notebook.listDocuments(query);
  }
  documentDetail(id: string) {
    return this.notebook.documentDetail(id);
  }
  createDocument(input: z.input<typeof CreateDocumentSchema>) {
    return this.mutate("document-create", input.clientRequestId, input, () =>
      this.notebook.createDocument(input),
    );
  }
  saveDocument(id: string, input: z.input<typeof SaveDocumentSchema>) {
    return this.mutate(
      `document-save:${id}`,
      input.clientMutationId,
      input,
      () => this.notebook.saveDocument(id, input),
    );
  }
  documentVersion(
    id: string,
    input: z.input<typeof DocumentVersionRequestSchema>,
  ) {
    return this.mutate(
      `document-version:${id}`,
      input.clientMutationId,
      input,
      () => this.notebook.captureDocumentVersion(id, input),
    );
  }
  documentMarkdown(id: string) {
    return this.notebook.documentMarkdown(id);
  }
  attemptMarkdown(id: string) {
    return this.notebook.attemptMarkdown(id);
  }
  observations(limit: number, offset: number) {
    return this.notebook.observations(limit, offset);
  }
  transformDocument(id: string, requestId: string) {
    return this.mutate(`document-transform:${id}`, requestId, { id }, () => {
      const document = this.notebook.getDocument(id),
        base = getCard("m7-source-01");
      if (!base)
        throw new AppError(
          409,
          "card_missing",
          "Brak karty do pracy z własnym tekstem.",
        );
      const card = CardSchema.strip().parse({
        ...base,
        id: `own-${id}-${document.revision}`,
        version: document.revision + 1,
        itemFamilyId: `own-document-${id}`,
        sourceText: document.currentText,
        prompt: {
          title: document.title || "Z własnego tekstu",
          stimulus: "Twój własny tekst",
          instruction:
            "Wybierz słowa z własnego tekstu, usuń zbędne, zmień ich kolejność i dopisz nowe. Oryginał pozostaje w zeszycie.",
        },
        contentOrigin: "Własny tekst użytkownika",
        licenseStatus: "Prywatny materiał autora.",
      });
      const attempt = this.insertAttempt(card);
      return this.writeAttempt({ ...attempt, sourceDocumentId: id });
    });
  }

  reviseAttempt(id: string, requestId: string) {
    return this.mutate(`revise:${id}`, requestId, { id }, () => {
      const source = this.getAttempt(id);
      if (source.guided)
        throw new AppError(409, "guided_restart", "Nowe ćwiczenie prowadzone rozpocznij od Start. Dotychczasowa scena pozostaje w zeszycie.");
      if (source.status === "draft")
        throw new AppError(
          409,
          "still_draft",
          "Najpierw zakończ albo zachowaj szkic.",
        );
      const now = this.clock().toISOString();
      const copy = AttemptSchema.parse({
        ...source,
        id: randomUUID(),
        mode: "repeat",
        llmMode: this.settings().llmMode,
        sourceAttemptId: id,
        sessionId: null,
        status: "draft",
        revision: 0,
        noveltyStatus: "seen",
        assistanceTracking: "unknown",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        selfRatings: null,
      });
      this.db
        .prepare(
          "INSERT INTO attempts(id,revision,status,record) VALUES (?,?,?,?)",
        )
        .run(copy.id, 0, "draft", JSON.stringify(copy));
      this.capture(copy, "manual");
      return copy;
    });
  }
}
