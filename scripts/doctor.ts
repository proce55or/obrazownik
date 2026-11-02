import { resolveDataDir, createDataDir } from "../src/server/paths.js";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdtempSync, rmSync, accessSync, constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const temp = mkdtempSync(path.join(tmpdir(), "obrazownik-doctor-"));
try {
  assert.match(
    process.versions.node,
    /^24\.21\./,
    "Wymagany Node 24.21.x; sprawdź .nvmrc.",
  );
  const dataDir = resolveDataDir(process.env.OBRAZOWNIK_DATA_DIR);
  createDataDir(dataDir);
  accessSync(dataDir, constants.R_OK | constants.W_OK);
  let db = new DatabaseSync(path.join(temp, "smoke.sqlite"));
  db.exec("CREATE TABLE sample(text TEXT); BEGIN");
  const value = "Zażółć gęślą jaźń\nDruga linia";
  db.prepare("INSERT INTO sample VALUES (?)").run(value);
  db.exec("COMMIT");
  db.close();
  db = new DatabaseSync(path.join(temp, "smoke.sqlite"));
  assert.equal(db.prepare("SELECT text FROM sample").get()?.text, value);
  await backup(db, path.join(temp, "copy.sqlite"));
  db.close();
  const copy = new DatabaseSync(path.join(temp, "copy.sqlite"));
  assert.equal(copy.prepare("SELECT text FROM sample").get()?.text, value);
  copy.close();
  console.log(
    `PASS: Node ${process.versions.node}, ${process.platform}/${process.arch}, SQLite zapis/restart/kopia.\nDane: ${dataDir}`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
