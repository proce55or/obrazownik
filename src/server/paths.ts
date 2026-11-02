import { existsSync, mkdirSync, realpathSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Stable for source (src/server) and compiled output (dist/server/server).
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(
  moduleDir,
  moduleDir.includes(`${path.sep}dist${path.sep}`) ? "../../.." : "../..",
);
function canonicalPath(input: string): string {
  if (existsSync(input)) return realpathSync(input);
  const parent = path.dirname(input);
  if (parent === input) throw new Error("Nie można ustalić folderu danych.");
  return path.join(canonicalPath(parent), path.basename(input));
}
export function resolveDataDir(
  configured?: string,
  root = projectRoot,
): string {
  const input = configured ?? path.join(homedir(), "Obrazownik-dane");
  if (!path.isAbsolute(input))
    throw new Error("OBRAZOWNIK_DATA_DIR musi być ścieżką absolutną.");
  const data = canonicalPath(path.normalize(input));
  const repo = realpathSync(root);
  const relative = path.relative(repo, data);
  if (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  ) {
    throw new Error("Folder danych musi znajdować się poza repozytorium.");
  }
  if (data === path.parse(data).root || data === homedir())
    throw new Error("Wybierz osobny folder danych.");
  return data;
}
export function createDataDir(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
}
