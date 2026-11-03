import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { verifiedBackup } from "./backup.js";
export interface Migration {
  version: number;
  sql: string;
}
export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE appMeta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id=1), record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE sessions (id TEXT PRIMARY KEY, record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE attempts (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, status TEXT NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE attemptVersions (id TEXT PRIMARY KEY, attemptId TEXT NOT NULL REFERENCES attempts(id), record TEXT NOT NULL CHECK(json_valid(record)));
CREATE INDEX versionsByAttempt ON attemptVersions(attemptId);
CREATE TABLE assistanceEvents (id TEXT PRIMARY KEY, attemptId TEXT NOT NULL REFERENCES attempts(id), record TEXT NOT NULL CHECK(json_valid(record)));
CREATE INDEX assistanceByAttempt ON assistanceEvents(attemptId);
CREATE TABLE exposures (id TEXT PRIMARY KEY, attemptId TEXT NOT NULL REFERENCES attempts(id), cardId TEXT NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)), UNIQUE(attemptId));
CREATE TABLE documents (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE documentVersions (id TEXT PRIMARY KEY, documentId TEXT NOT NULL REFERENCES documents(id), record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE dueReviews (id TEXT PRIMARY KEY, sourceAttemptId TEXT NOT NULL REFERENCES attempts(id), record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE migrationHistory (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL);
CREATE TABLE importBatches (id TEXT PRIMARY KEY, sourceDigest TEXT NOT NULL UNIQUE, importedAt TEXT NOT NULL, recordCount INTEGER NOT NULL);
CREATE TABLE mutations (scope TEXT NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)), PRIMARY KEY(scope,id));
`,
  },
  { version: 2, sql: `
CREATE TABLE methods (key TEXT PRIMARY KEY, record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE cardRegistry (key TEXT PRIMARY KEY, record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE contentExposure (id TEXT PRIMARY KEY, cardId TEXT NOT NULL, cardVersion INTEGER NOT NULL, itemFamilyId TEXT NOT NULL, attemptId TEXT REFERENCES attempts(id), kind TEXT NOT NULL, shownAt TEXT NOT NULL);
CREATE INDEX exposureFamily ON contentExposure(itemFamilyId);
INSERT INTO appMeta(key,value) VALUES ('exposureHistory', CASE WHEN EXISTS(SELECT 1 FROM attempts) THEN 'unknown' ELSE 'known' END);
UPDATE attempts SET record=json_set(record,'$.assistanceTracking','unknown','$.exposureTracking','unknown','$.methodId','legacy-unmapped','$.methodVersion',1,'$.methodSnapshot',null,'$.itemFamilyId','legacy-unknown','$.setRole',CASE WHEN json_extract(record,'$.mode')='independent' THEN 'independent_writing' ELSE 'training' END,'$.responseMode','open_writing','$.noveltyStatus','unknown','$.scaffolding',json('{}'),'$.sourceText',null);
` },
  {version:3,sql:`
UPDATE attempts SET record=json_set(record,'$.llmMode',COALESCE(json_extract(record,'$.llmMode'),'unknown'));
UPDATE assistanceEvents SET record=json_set(record,'$.provider',COALESCE(json_extract(record,'$.provider'),'unknown'),'$.llm',json_extract(record,'$.llm'));
`},
  // Guided JSON records cannot be opened safely by earlier strict schemas.
  {version:4,sql:'SELECT 1;'},
];
export async function migrate(
  db: DatabaseSync,
  backupDir: string,
  existingDatabase: boolean,
  steps = migrations,
): Promise<void> {
  const current = Number(db.prepare("PRAGMA user_version").get()!.user_version);
  const latest = steps.at(-1)?.version ?? 0;
  if (current > latest)
    throw new Error(
      "Baza ma nowszy format. Uruchom zgodną wersję Obrazownika. Nie zmieniono danych.",
    );
  if (current === latest) return;
  if (existingDatabase) {
    await verifiedBackup(db, path.dirname(backupDir), `before-migration-${current}`);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const step of steps.filter((s) => s.version > current)) {
      db.exec(step.sql);
      db.prepare(
        "INSERT INTO migrationHistory(version, appliedAt) VALUES (?, ?)",
      ).run(step.version, new Date().toISOString());
      db.exec(`PRAGMA user_version = ${Number(step.version)}`);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
