import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AttemptSchema,
  AssistanceStateSchema,
  FamilySchema,
  RatingsSchema,
  AssistanceSchema,
  type Attempt,
} from "../shared/schemas.js";
import {
  DocumentSchema,
  DocumentVersionSchema,
  type DocumentRecord,
} from "../shared/records.js";
import { AppError } from "./errors.js";

export const NotebookQuerySchema = z
  .object({
    query: z.string().max(500).default(""),
    family: FamilySchema.optional(),
    mode: z
      .enum([
        "training",
        "repeat",
        "near_transfer",
        "independent",
        "assisted_writing",
      ])
      .optional(),
    assistance: z
      .enum([
        "none_confirmed",
        "assisted",
        "unknown",
        "question",
        "direction",
        "example",
      ])
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();
export const DocumentListQuerySchema = NotebookQuerySchema.pick({
  query: true,
  limit: true,
  offset: true,
});
export const CreateDocumentSchema = z
  .object({
    title: z.string().max(200),
    text: z.string().max(50_000),
    source: z.enum(["own", "sample"]).default("own"),
    clientRequestId: z.uuid(),
  })
  .strict();
export const SaveDocumentSchema = z
  .object({
    text: z.string().max(50_000),
    title: z.string().max(200).optional(),
    expectedRevision: z.number().int().nonnegative(),
    clientMutationId: z.uuid(),
    replaceAll: z.boolean().default(false),
  })
  .strict();
export const DocumentVersionRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    clientMutationId: z.uuid(),
    text: z.string().max(50_000).optional(),
  })
  .strict();
export type NotebookQuery = z.infer<typeof NotebookQuerySchema>;
export type NotebookAttempt = Attempt & {
  assistanceState: z.infer<typeof AssistanceStateSchema>;
  assistanceLevel: number;
  bielikAssistanceState: 'delivered'|'prepared'|'none'|'unknown';
};
export const observationCategories = [
  "training",
  "repeat",
  "near_transfer",
  "independent",
  "assisted_writing",
] as const;
export type ObservationCategory = (typeof observationCategories)[number];
type RatingKey = "ease" | "voice" | "fatigue" | "intention";
interface ObservationGroup {
  category: ObservationCategory;
  count: number;
  assistance: Record<z.infer<typeof AssistanceStateSchema>, number>;
  novelty: Record<"new_confirmed" | "seen" | "unknown", number>;
  ratings: Record<RatingKey, number[]>;
}

// Prepared and absent historical data remain uncertain. Only explicit tracking
// plus no recorded help is sufficient for none_confirmed.
const entries = `WITH help AS (
 SELECT attemptId,
 MAX(CASE WHEN json_extract(record,'$.status')='prepared' THEN 1 ELSE 0 END) uncertain,
 MAX(CASE WHEN json_extract(record,'$.status')='delivered' THEN 1 ELSE 0 END) delivered,
 MAX(CASE WHEN json_extract(record,'$.status') IN ('prepared','delivered') THEN CAST(json_extract(record,'$.level') AS INTEGER) ELSE 0 END) assistanceLevel,
 MAX(CASE WHEN json_extract(record,'$.provider')='bielik_local' AND json_extract(record,'$.status')='delivered' THEN 1 ELSE 0 END) bielikDelivered,
 MAX(CASE WHEN json_extract(record,'$.provider')='bielik_local' AND json_extract(record,'$.status')='prepared' THEN 1 ELSE 0 END) bielikPrepared,
 MAX(CASE WHEN COALESCE(json_extract(record,'$.provider'),'unknown')='unknown' AND json_extract(record,'$.status') IN ('prepared','delivered') THEN 1 ELSE 0 END) unknownProvider
 FROM assistanceEvents GROUP BY attemptId
), entries AS (
 SELECT a.id,a.record,
 CASE WHEN COALESCE(h.uncertain,0)=1 THEN 'unknown'
 WHEN COALESCE(h.delivered,0)=1 THEN 'assisted'
 WHEN json_extract(a.record,'$.assistanceTracking')='known' THEN 'none_confirmed'
 ELSE 'unknown' END assistanceState,
 COALESCE(h.assistanceLevel,0) assistanceLevel,
 CASE WHEN COALESCE(h.bielikDelivered,0)=1 THEN 'delivered'
 WHEN COALESCE(h.bielikPrepared,0)=1 THEN 'prepared'
 WHEN COALESCE(h.unknownProvider,0)=1 THEN 'unknown'
 WHEN json_extract(a.record,'$.assistanceTracking')='known' THEN 'none'
 ELSE 'unknown' END bielikAssistanceState,
 CASE WHEN json_extract(a.record,'$.mode')='repeat' THEN 'repeat'
 WHEN json_extract(a.record,'$.setRole')='near_transfer' THEN 'near_transfer'
 WHEN json_extract(a.record,'$.mode')='independent' THEN 'independent'
 WHEN json_extract(a.record,'$.setRole')='independent_writing' THEN 'assisted_writing'
 ELSE 'training' END category
 FROM attempts a LEFT JOIN help h ON h.attemptId=a.id
)`;
function codeBlock(text: string): string {
  const longest = Math.max(
    0,
    ...[...text.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}
function heading(text: string): string {
  const clean=text.replace(/[\r\n]/g,' '), markers="\\`*_{}[]()#+.!>~|";
  return Array.from(clean,c=>markers.includes(c)?"\\"+c:c).join('')||'Bez tytułu';
}

function stateLabel(state: string, level = 0): string {
  return state === "unknown"
    ? "Nieznana lub niepewna historia pomocy"
    : state === "none_confirmed"
      ? "Bez zarejestrowanej pomocy w aplikacji"
      : level === 3
        ? "Po obejrzeniu przykładu"
        : `Z pomocą, poziom ${level}`;
}

/** SQL adapter: callers wrap mutations in Storage.mutate/transaction. */
export class Notebook {
  constructor(private db: DatabaseSync) {
    db.function("obrazownik_search", { deterministic: true }, (value) =>
      String(value ?? "")
        .normalize("NFC")
        .toLocaleLowerCase("pl"),
    );
  }
  listAttempts(input: Partial<NotebookQuery> = {}) {
    const query = NotebookQuerySchema.parse(input),
      where: string[] = [],
      values: Array<string | number> = [];
    if (query.query) {
      where.push(
        "instr(obrazownik_search(COALESCE(json_extract(record,'$.currentText'),'') || ' ' || COALESCE(json_extract(record,'$.promptSnapshot.title'),'')),obrazownik_search(?))>0",
      );
      values.push(query.query);
    }
    if (query.family) {
      where.push("json_extract(record,'$.family')=?");
      values.push(query.family);
    }
    if (query.mode) {
      where.push("category=?");
      values.push(query.mode);
    }
    if (query.assistance) {
      if (["question", "direction", "example"].includes(query.assistance)) {
        where.push("assistanceState='assisted' AND assistanceLevel=?");
        values.push(
          { question: 1, direction: 2, example: 3 }[
            query.assistance as "question" | "direction" | "example"
          ],
        );
      } else {
        where.push("assistanceState=?");
        values.push(query.assistance);
      }
    }
    const filter = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      this.db
        .prepare(`${entries} SELECT COUNT(*) count FROM entries${filter}`)
        .get(...values)?.count ?? 0,
    );
    const rows = this.db
      .prepare(
        `${entries} SELECT record,assistanceState,assistanceLevel,bielikAssistanceState FROM entries${filter} ORDER BY json_extract(record,'$.updatedAt') DESC,id LIMIT ? OFFSET ?`,
      )
      .all(...values, query.limit, query.offset);
    const attempts: NotebookAttempt[] = rows.map((row) => ({
      ...AttemptSchema.parse(JSON.parse(String(row.record))),
      assistanceState: AssistanceStateSchema.parse(row.assistanceState),
      assistanceLevel: Number(row.assistanceLevel),
      bielikAssistanceState: z.enum(['delivered','prepared','none','unknown']).parse(row.bielikAssistanceState),
    }));
    return { attempts, total, limit: query.limit, offset: query.offset };
  }
  listDocuments(
    input: { query?: string; limit?: number; offset?: number } = {},
  ) {
    const query = DocumentListQuerySchema.parse(input);
    const filter = query.query
      ? " WHERE instr(obrazownik_search(json_extract(record,'$.title') || ' ' || json_extract(record,'$.currentText')),obrazownik_search(?))>0"
      : "";
    const values = query.query ? [query.query] : [];
    const total = Number(
      this.db
        .prepare(`SELECT COUNT(*) count FROM documents${filter}`)
        .get(...values)?.count ?? 0,
    );
    const rows = this.db
      .prepare(
        `SELECT record FROM documents${filter} ORDER BY json_extract(record,'$.updatedAt') DESC,id LIMIT ? OFFSET ?`,
      )
      .all(...values, query.limit, query.offset);
    return {
      documents: rows.map((row) =>
        DocumentSchema.parse(JSON.parse(String(row.record))),
      ),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }
  getDocument(id: string): DocumentRecord {
    z.uuid().parse(id);
    const row = this.db
      .prepare("SELECT record FROM documents WHERE id=?")
      .get(id);
    if (!row)
      throw new AppError(404, "not_found", "Nie znaleziono tego tekstu.");
    return DocumentSchema.parse(JSON.parse(String(row.record)));
  }
  documentVersions(id: string) {
    return this.db
      .prepare(
        "SELECT record FROM documentVersions WHERE documentId=? ORDER BY rowid DESC",
      )
      .all(id)
      .map((row) =>
        DocumentVersionSchema.parse(JSON.parse(String(row.record))),
      );
  }
  documentDetail(id: string) {
    return {
      document: this.getDocument(id),
      versions: this.documentVersions(id),
    };
  }
  createDocument(input: z.input<typeof CreateDocumentSchema>): DocumentRecord {
    const value = CreateDocumentSchema.parse(input),
      now = new Date().toISOString();
    const document = DocumentSchema.parse({
      id: randomUUID(),
      title: value.title,
      currentText: value.text,
      source: value.source,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    });
    this.db
      .prepare("INSERT INTO documents(id,revision,record) VALUES (?,?,?)")
      .run(document.id, document.revision, JSON.stringify(document));
    return document;
  }
  private checkRevision(id: string, expected: number): DocumentRecord {
    const document = this.getDocument(id);
    if (document.revision !== expected)
      throw new AppError(
        409,
        "revision_conflict",
        "Ten tekst zmienił się w innej karcie. Zachowaj swoją wersję osobno.",
        false,
        document.revision,
      );
    return document;
  }
  private writeDocument(document: DocumentRecord): DocumentRecord {
    const parsed = DocumentSchema.parse(document);
    this.db
      .prepare("UPDATE documents SET revision=?,record=? WHERE id=?")
      .run(parsed.revision, JSON.stringify(parsed), parsed.id);
    return parsed;
  }
  private capture(
    document: DocumentRecord,
    reason: "manual" | "pre_replace",
    text = document.currentText,
  ) {
    const version = DocumentVersionSchema.parse({
      id: randomUUID(),
      documentId: document.id,
      text,
      reason,
      createdAt: new Date().toISOString(),
    });
    this.db
      .prepare(
        "INSERT INTO documentVersions(id,documentId,record) VALUES (?,?,?)",
      )
      .run(version.id, document.id, JSON.stringify(version));
    return version;
  }
  saveDocument(
    id: string,
    input: z.input<typeof SaveDocumentSchema>,
  ): DocumentRecord {
    const value = SaveDocumentSchema.parse(input),
      document = this.checkRevision(id, value.expectedRevision);
    if (value.replaceAll && value.text !== document.currentText)
      this.capture(document, "pre_replace");
    return this.writeDocument({
      ...document,
      title: value.title ?? document.title,
      currentText: value.text,
      revision: document.revision + 1,
      updatedAt: new Date().toISOString(),
    });
  }
  captureDocumentVersion(
    id: string,
    input: z.input<typeof DocumentVersionRequestSchema>,
  ) {
    const value = DocumentVersionRequestSchema.parse(input),
      document = this.checkRevision(id, value.expectedRevision);
    this.capture(document, "manual", value.text ?? document.currentText);
    this.writeDocument({
      ...document,
      revision: document.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    return this.documentDetail(id);
  }
  documentMarkdown(id: string): string {
    const document = this.getDocument(id);
    return `# ${heading(document.title)}\n\nWłasny tekst · ${document.source === "own" ? "materiał autora" : "materiał przykładowy"}\n\nUtworzono: ${document.createdAt}\nOstatni zapis: ${document.updatedAt}\n\n${codeBlock(document.currentText)}\n`;
  }
  attemptMarkdown(id: string): string {
    z.uuid().parse(id);
    const row = this.db
      .prepare(
        `${entries} SELECT record,assistanceState,assistanceLevel FROM entries WHERE id=?`,
      )
      .get(id);
    if (!row) throw new AppError(404, "not_found", "Nie znaleziono tej próby.");
    const attempt = AttemptSchema.parse(JSON.parse(String(row.record)));
    const llmHelp=this.db.prepare('SELECT record FROM assistanceEvents WHERE attemptId=?').all(id).map(r=>AssistanceSchema.parse(JSON.parse(String(r.record)))).filter(e=>e.provider==='bielik_local'&&e.status!=='failed');
    const sources=llmHelp.map(e=>`Lokalny model: ${e.llm!.modelId}; SHA256: ${e.llm!.modelSha256}; prompt: ${e.llm!.promptVersion}; odbiór: ${e.status}; przygotowano: ${e.llm!.generatedAt}`).join('\n');
    return `# ${heading(attempt.promptSnapshot.title)}\n\n${stateLabel(String(row.assistanceState), Number(row.assistanceLevel))}\n\nTryb: ${attempt.mode}; materiał: ${attempt.setRole}; tryb LLM: ${attempt.llmMode}\n${sources?`${sources}\n`:''}Zapis: ${attempt.updatedAt}\n\n## Polecenie\n\n${attempt.promptSnapshot.instruction}\n\n## Własny tekst\n\n${codeBlock(attempt.currentText)}\n`;
  }
  observations(limit = 30, offset = 0) {
    const page = DocumentListQuerySchema.parse({ limit, offset });
    const groups: ObservationGroup[] = observationCategories.map(
      (category) => ({
        category,
        count: 0,
        assistance: { none_confirmed: 0, assisted: 0, unknown: 0 },
        novelty: { new_confirmed: 0, seen: 0, unknown: 0 },
        ratings: {
          ease: [0, 0, 0, 0, 0],
          voice: [0, 0, 0, 0, 0],
          fatigue: [0, 0, 0, 0, 0],
          intention: [0, 0, 0, 0, 0],
        },
      }),
    );
    const complete =
      "json_extract(record,'$.status')='completed' AND COALESCE(json_extract(record,'$.responseMode'),'open_writing')='open_writing'";
    const rows = this.db
      .prepare(
        `${entries} SELECT category,assistanceState,COALESCE(json_extract(record,'$.noveltyStatus'),'unknown') noveltyStatus,json_extract(record,'$.selfRatings') ratings FROM entries WHERE ${complete}`,
      )
      .all();
    for (const row of rows) {
      const group = groups.find((value) => value.category === row.category)!;
      group.count++;
      group.assistance[AssistanceStateSchema.parse(row.assistanceState)]++;
      const novelty = z
        .enum(["new_confirmed", "seen", "unknown"])
        .parse(row.noveltyStatus);
      group.novelty[novelty]++;
      const ratings = row.ratings
        ? RatingsSchema.parse(JSON.parse(String(row.ratings)))
        : {};
      for (const key of ["ease", "voice", "fatigue", "intention"] as const) {
        const value = ratings[key];
        if (value) group.ratings[key][value - 1]++;
      }
    }
    const samples = this.db
      .prepare(
        `${entries} SELECT id,category,assistanceState,assistanceLevel,bielikAssistanceState,COALESCE(json_extract(record,'$.llmMode'),'unknown') llmMode,COALESCE(json_extract(record,'$.noveltyStatus'),'unknown') noveltyStatus,json_extract(record,'$.promptSnapshot.title') title,json_extract(record,'$.createdAt') createdAt,json_extract(record,'$.selfRatings') selfRatings FROM entries WHERE ${complete} ORDER BY json_extract(record,'$.createdAt') DESC,id LIMIT ? OFFSET ?`,
      )
      .all(page.limit, page.offset)
      .map((row) => ({
        id: String(row.id),
        category: row.category as ObservationCategory,
        llmMode: z.enum(['off','bielik','unknown']).parse(row.llmMode),
        bielikAssistanceState: z.enum(['delivered','prepared','none','unknown']).parse(row.bielikAssistanceState),
        assistanceState: AssistanceStateSchema.parse(row.assistanceState),
        assistanceLevel: Number(row.assistanceLevel),
        noveltyStatus: z
          .enum(["new_confirmed", "seen", "unknown"])
          .parse(row.noveltyStatus),
        title: String(row.title),
        createdAt: String(row.createdAt),
        selfRatings: row.selfRatings
          ? RatingsSchema.parse(JSON.parse(String(row.selfRatings)))
          : null,
      }));
    return {
      groups,
      samples,
      total: rows.length,
      limit: page.limit,
      offset: page.offset,
    };
  }
}
