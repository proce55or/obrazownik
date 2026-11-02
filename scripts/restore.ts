import { DatabaseSync, backup } from "node:sqlite";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  chmodSync,
  renameSync,
  rmSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { resolveDataDir, createDataDir } from "../src/server/paths.js";
import { acquireLock } from "../src/server/lock.js";
import { safeSubdir } from "../src/server/backup.js";
import { migrations } from "../src/server/migrations.js";

const databaseName = "obrazownik.sqlite";
const sidecars = ["", "-wal", "-shm", "-journal"] as const;
const requiredTables = [
  "appMeta",
  "settings",
  "attempts",
  "attemptVersions",
  "assistanceEvents",
  "exposures",
  "documents",
  "documentVersions",
  "dueReviews",
  "migrationHistory",
  "sessions",
  "importBatches",
  "mutations",
];
function existingRegularFile(file: string): boolean {
  try {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error(
        "Kopia i pliki bazy muszą być zwykłymi plikami, bez dowiązań.",
      );
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
function inspect(db: DatabaseSync): { schemaVersion: number; digest: string } {
  const latest = migrations.at(-1)?.version ?? 0;
  const schemaVersion = Number(
    db.prepare("PRAGMA user_version").get()?.user_version,
  );
  if (
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 1 ||
    schemaVersion > latest
  )
    throw new Error(
      "Kopia ma nieobsługiwany lub nowszy format. Nie zmieniono bieżącej bazy.",
    );
  if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok")
    throw new Error("Kopia nie przeszła sprawdzenia integralności.");
  if (db.prepare("PRAGMA foreign_key_check").all().length)
    throw new Error("Kopia zawiera nieprawidłowe powiązania danych.");
  const tables = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  const names = new Set(tables.map((row) => String(row.name)));
  const schemaTables =
    schemaVersion >= 2
      ? [...requiredTables, "methods", "cardRegistry", "contentExposure"]
      : requiredTables;
  if (schemaTables.some((name) => !names.has(name)))
    throw new Error("To nie jest pełna baza Obrazownika.");
  const history = db
    .prepare("SELECT MAX(version) AS version FROM migrationHistory")
    .get();
  if (Number(history?.version) !== schemaVersion)
    throw new Error("Historia migracji kopii jest niespójna.");
  const hash = createHash("sha256");
  for (const table of tables) {
    const name = String(table.name);
    const quoted = `"${name.replaceAll('"', '""')}"`;
    const records = db
      .prepare(`SELECT * FROM ${quoted}`)
      .all()
      .map((row) =>
        JSON.stringify(row, (_key, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      )
      .sort();
    hash.update(JSON.stringify([name, String(table.sql), records]));
  }
  return { schemaVersion, digest: hash.digest("hex") };
}
export interface RestoreResult {
  schemaVersion: number;
  previousDatabase: string | null;
  verified: true;
}

/** Restore a standalone SQLite snapshot. Never opens a production default in tests. */
export async function restoreDatabase(
  copyPath: string,
  configuredDataDir?: string,
): Promise<RestoreResult> {
  if (!path.isAbsolute(copyPath))
    throw new Error("Podaj absolutną ścieżkę pliku kopii.");
  if (!existingRegularFile(copyPath))
    throw new Error("Nie znaleziono pliku kopii.");
  const sourcePath = realpathSync(copyPath);
  const dataDir = resolveDataDir(
    configuredDataDir ?? process.env.OBRAZOWNIK_DATA_DIR,
  );
  createDataDir(dataDir);
  const release = acquireLock(dataDir);
  const destination = path.join(dataDir, databaseName);
  const temporary = path.join(dataDir, `.restore-${randomUUID()}.sqlite.tmp`);
  let preservedDir: string | undefined;
  let installed = false;
  const moved: Array<{ original: string; preserved: string }> = [];
  let source: DatabaseSync | undefined;
  try {
    if (sourcePath === destination)
      throw new Error("Wybierz plik kopii inny niż bieżąca baza.");
    for (const suffix of sidecars) existingRegularFile(destination + suffix);
    source = new DatabaseSync(sourcePath, { readOnly: true });
    const expected = inspect(source);
    // Refuse to overwrite a database from a newer application, even with an older copy.
    if (existsSync(destination)) {
      let current: DatabaseSync | undefined;
      try {
        current = new DatabaseSync(destination, { readOnly: true });
        const currentVersion = Number(
          current.prepare("PRAGMA user_version").get()?.user_version,
        );
        if (currentVersion > (migrations.at(-1)?.version ?? 0))
          throw new Error(
            "Bieżąca baza ma nowszy format. Użyj zgodnej wersji aplikacji.",
          );
      } catch (error) {
        if (error instanceof Error && error.message.includes("nowszy format"))
          throw error;
        // A damaged current database may be recovered, but its original files are retained.
      } finally {
        current?.close();
      }
    }
    await backup(source, temporary);
    chmodSync(temporary, 0o600);
    source.close();
    source = undefined;
    const staged = new DatabaseSync(temporary, { readOnly: true });
    try {
      if (inspect(staged).digest !== expected.digest)
        throw new Error("Przygotowana kopia różni się od źródła.");
    } finally {
      staged.close();
    }

    const present = sidecars.filter((suffix) =>
      existsSync(destination + suffix),
    );
    if (present.length) {
      preservedDir = path.join(
        safeSubdir(dataDir, "backups"),
        `before-restore-${randomUUID()}`,
      );
      mkdirSync(preservedDir, { mode: 0o700 });
      for (const suffix of present) {
        const original = destination + suffix;
        const preserved = path.join(preservedDir, databaseName + suffix);
        renameSync(original, preserved);
        moved.push({ original, preserved });
      }
    }
    renameSync(temporary, destination);
    installed = true;
    const restored = new DatabaseSync(destination, { readOnly: true });
    try {
      if (inspect(restored).digest !== expected.digest)
        throw new Error("Odtworzona baza nie przeszła porównania danych.");
    } finally {
      restored.close();
    }
    return {
      schemaVersion: expected.schemaVersion,
      previousDatabase: preservedDir
        ? path.join(preservedDir, databaseName)
        : null,
      verified: true,
    };
  } catch (error) {
    // Keep the attempted copy as well as the previous database if verification fails after the swap.
    if (installed && existsSync(destination)) {
      const failed = path.join(
        safeSubdir(dataDir, "backups"),
        `failed-restore-${randomUUID()}.sqlite`,
      );
      renameSync(destination, failed);
    }
    for (const item of [...moved].reverse())
      renameSync(item.preserved, item.original);
    throw error;
  } finally {
    try {
      source?.close();
      if (existsSync(temporary)) rmSync(temporary);
    } finally {
      release();
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  try {
    if (args.length !== 1)
      throw new Error(
        "Użycie: npm run restore -- /absolutna/sciezka/kopii.sqlite. Serwer musi być zatrzymany.",
      );
    const result = await restoreDatabase(args[0]);
    console.log(
      `Odtworzono i sprawdzono bazę (format ${result.schemaVersion}).`,
    );
    if (result.previousDatabase)
      console.log(`Poprzednia baza pozostaje w: ${result.previousDatabase}`);
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Nie udało się odtworzyć danych.",
    );
    process.exitCode = 1;
  }
}
