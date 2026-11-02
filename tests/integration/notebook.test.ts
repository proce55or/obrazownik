import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Notebook } from "../../src/server/notebook.js";
import { migrate } from "../../src/server/migrations.js";
import { AttemptSchema, AssistanceSchema } from "../../src/shared/schemas.js";

async function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "obrazownik-notebook-"));
  const db = new DatabaseSync(path.join(dir, "test.sqlite"));
  await migrate(db, path.join(dir, "backups"), false);
  db.exec("PRAGMA foreign_keys=ON");
  return {
    db,
    book: new Notebook(db),
    close: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
function record(db: DatabaseSync, values: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const attempt = AttemptSchema.parse({
    id: randomUUID(),
    sessionId: null,
    cardId: "synthetic-card",
    cardVersion: 1,
    promptSnapshot: {
      title: "Zapisana próbka",
      stimulus: "Kamień",
      instruction: "Opisz jeden szczegół.",
    },
    family: "property",
    partition: "training",
    mode: "training",
    status: "completed",
    revision: 1,
    currentText: "Łódź i ŻÓŁĆ.\nDruga linia.",
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    sourceAttemptId: null,
    constraints: [],
    selfRatings: null,
    assistanceTracking: "known",
    exposureTracking: "known",
    ...values,
  });
  db.prepare(
    "INSERT INTO attempts(id,revision,status,record) VALUES (?,?,?,?)",
  ).run(attempt.id, attempt.revision, attempt.status, JSON.stringify(attempt));
  return attempt;
}
function help(
  db: DatabaseSync,
  id: string,
  level: number,
  status: "prepared" | "delivered",
) {
  const now = new Date().toISOString(),
    event = AssistanceSchema.parse({
      id: randomUUID(),
      attemptId: id,
      level,
      status,
      kind: level === 3 ? "example" : "question",
      revealedContentSnapshot: "Syntetyczna pomoc.",
      requestedAt: now,
      deliveredAt: status === "delivered" ? now : null,
    });
  db.prepare(
    "INSERT INTO assistanceEvents(id,attemptId,record) VALUES (?,?,?)",
  ).run(event.id, id, JSON.stringify(event));
}

test("documents preserve exact Unicode and tags; replacement and manual versions never overwrite source", async () => {
  const f = await fixture();
  try {
    const text =
      "  Zażółć gęślą jaźń\n<script>synthetic()</script>\n\nDwa wersy.  ";
    const created = f.book.createDocument({
      title: "Żółty zeszyt",
      text,
      clientRequestId: randomUUID(),
    });
    const saved = f.book.saveDocument(created.id, {
      text: "Nowy tekst.\nDruga linia.",
      expectedRevision: 0,
      clientMutationId: randomUUID(),
      replaceAll: true,
    });
    expect(saved.revision).toBe(1);
    expect(f.book.documentVersions(created.id)[0]).toMatchObject({
      reason: "pre_replace",
      text,
    });
    expect(() =>
      f.book.saveDocument(created.id, {
        text: "Druga karta",
        expectedRevision: 0,
        clientMutationId: randomUUID(),
      }),
    ).toThrow(/innej karcie/);
    const separate = f.book.captureDocumentVersion(created.id, {
      text: "Lokalna inna wersja.",
      expectedRevision: 1,
      clientMutationId: randomUUID(),
    });
    expect(separate.document.currentText).toBe(saved.currentText);
    expect(separate.document.revision).toBe(2);
    expect(separate.versions).toHaveLength(2);
    expect(separate.versions[0]).toMatchObject({
      reason: "manual",
      text: "Lokalna inna wersja.",
    });
    const exportText = f.book.documentMarkdown(created.id);
    expect(exportText).toContain(saved.currentText);
    expect(exportText).toContain("Żółty zeszyt");
    expect(
      f.book
        .documentVersions(created.id)
        .find((value) => value.reason === "pre_replace")?.text,
    ).toBe(text);
  } finally {
    f.close();
  }
});

test("notebook searches literal Polish text and paginates documents and attempts", async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 25; i++)
      f.book.createDocument({
        title: `Tekst ${i}`,
        text: i === 3 ? "ŻÓŁĆ i źdźbło. 100% _" : `Przykład ${i}`,
        clientRequestId: randomUUID(),
      });
    expect(
      f.book.listDocuments({ limit: 10, offset: 10 }).documents,
    ).toHaveLength(10);
    expect(f.book.listDocuments({ query: "żółć" }).total).toBe(1);
    expect(f.book.listDocuments({ query: "% _" }).total).toBe(1);
    expect(f.book.listDocuments({ query: "not found" }).total).toBe(0);
    for (let i = 0; i < 25; i++)
      record(f.db, { currentText: `Próbka ${i} — ŻÓŁĆ` });
    const first = f.book.listAttempts({ query: "żółć", limit: 10, offset: 0 }),
      second = f.book.listAttempts({ query: "żółć", limit: 10, offset: 10 });
    expect(first.total).toBe(25);
    expect(first.attempts).toHaveLength(10);
    expect(second.attempts).toHaveLength(10);
    expect(
      first.attempts.some((a) => second.attempts.some((b) => b.id === a.id)),
    ).toBe(false);
    expect(() => f.book.listAttempts({ limit: 101 })).toThrow();
    expect(() => f.book.listDocuments({ offset: -1 })).toThrow();
  } finally {
    f.close();
  }
});

test("help filters keep legacy and uncertain help unknown, and observations separate all writing categories", async () => {
  const f = await fixture();
  try {
    record(f.db, {
      assistanceTracking: "unknown",
      selfRatings: { ease: 1 },
      noveltyStatus: "unknown",
    });
    const question = record(f.db, {
      family: "verb",
      selfRatings: { voice: 4 },
      noveltyStatus: "seen",
    });
    help(f.db, question.id, 1, "delivered");
    const uncertain = record(f.db, {
      mode: "repeat",
      selfRatings: { ease: 3 },
    });
    help(f.db, uncertain.id, 3, "prepared");
    const independent = record(f.db, {
      mode: "independent",
      partition: "reserve",
      setRole: "independent_writing",
      noveltyStatus: "new_confirmed",
      selfRatings: { intention: 5 },
    });
    const assisted = record(f.db, {
      mode: "training",
      partition: "reserve",
      setRole: "independent_writing",
      sourceAttemptId: independent.id,
      noveltyStatus: "seen",
    });
    help(f.db, assisted.id, 2, "delivered");
    record(f.db, { mode: "training", setRole: "near_transfer" });
    record(f.db, {
      responseMode: "closed_naming",
      mode: "independent",
      setRole: "independent_writing",
    });
    expect(f.book.listAttempts({ assistance: "unknown" }).total).toBe(2);
    expect(
      f.book.listAttempts({ assistance: "question", family: "verb" })
        .attempts[0].id,
    ).toBe(question.id);
    expect(f.book.listAttempts({ assistance: "example" }).total).toBe(0);
    expect(
      f.book
        .listAttempts({ mode: "assisted_writing" })
        .attempts.map((value) => value.id),
    ).toEqual([assisted.id]);
    const observation = f.book.observations(2, 0);
    expect(observation.total).toBe(6);
    expect(observation.samples).toHaveLength(2);
    expect(
      observation.groups.find((value) => value.category === "independent"),
    ).toMatchObject({
      count: 1,
      assistance: { none_confirmed: 1, assisted: 0, unknown: 0 },
      novelty: { new_confirmed: 1, seen: 0, unknown: 0 },
    });
    expect(
      observation.groups.find((value) => value.category === "assisted_writing"),
    ).toMatchObject({ count: 1, assistance: { assisted: 1 } });
    expect(
      observation.groups.find((value) => value.category === "training")?.ratings
        .voice,
    ).toEqual([0, 0, 0, 1, 0]);
    expect(f.book.attemptMarkdown(uncertain.id)).toContain(
      "Nieznana lub niepewna historia pomocy",
    );
    expect(f.book.attemptMarkdown(independent.id)).toContain(
      "Bez zarejestrowanej pomocy w aplikacji",
    );
  } finally {
    f.close();
  }
});

test("a 10,000-entry synthetic notebook returns only the requested page and accurate totals", async () => {
  const f = await fixture();
  try {
    const base = record(f.db),
      insert = f.db.prepare(
        "INSERT INTO attempts(id,revision,status,record) VALUES (?,?,?,?)",
      );
    f.db.exec("BEGIN");
    try {
      for (let i = 1; i < 10_000; i++) {
        const value = {
          ...base,
          id: randomUUID(),
          currentText: `Syntetyczna próbka ${i}. Żółć i źdźbło.`,
        };
        insert.run(
          value.id,
          value.revision,
          value.status,
          JSON.stringify(value),
        );
      }
      f.db.exec("COMMIT");
    } catch (error) {
      f.db.exec("ROLLBACK");
      throw error;
    }
    const started = performance.now();
    const page = f.book.listAttempts({ limit: 20, offset: 9980 });
    const elapsed = performance.now() - started;
    expect(page.total).toBe(10_000);
    expect(page.attempts).toHaveLength(20);
    expect(
      f.book.listAttempts({ limit: 20, offset: 10_000 }).attempts,
    ).toHaveLength(0);
    console.log(
      `Notebook synthetic 10,000: paginated SQL read ${elapsed.toFixed(1)} ms, returned ${page.attempts.length} records.`,
    );
  } finally {
    f.close();
  }
}, 10_000);
