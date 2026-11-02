import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
export function acquireLock(dataDir: string): () => void {
  const dir = path.join(dataDir, '.obrazownik-lock');
  try { mkdirSync(dir, { mode: 0o700 }); }
  catch { throw new Error('Folder danych jest zablokowany przez inną instancję. Zamknij ją przed ponownym uruchomieniem. Po awarii sprawdź PID w .obrazownik-lock/owner.json; nie usuwaj blokady na podstawie samego portu.'); }
  try { writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { rmSync(dir, { recursive: true }); throw error; }
  return () => rmSync(dir, { recursive: true });
}
