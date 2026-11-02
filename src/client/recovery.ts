import { z } from "zod";
import type { RecoveryDraft } from "../domain/draft-queue";
const RecoverySchema = z.object({
  key: z.string(),
  id: z.uuid(),
  environmentId: z.uuid(),
  baseRevision: z.number().int().nonnegative(),
  text: z.string().max(50_000),
  updatedAt: z.iso.datetime(),
});
const keyOf = (environmentId: string, id: string) => `${environmentId}:${id}`;
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  return (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("obrazownik-recovery-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Bufor ratunkowy jest zablokowany."));
  }));
}
export async function putRecovery(draft: RecoveryDraft): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite"),
      store = tx.objectStore("drafts");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(new Error("Bufor ratunkowy jest pełny lub niedostępny."));
    const key = keyOf(draft.environmentId, draft.id);
    const request = store.getAll();
    request.onsuccess = () => {
      const records = request.result.filter((r) => r.key !== key);
      const record = RecoverySchema.parse({ ...draft, key });
      const bytes = new TextEncoder().encode(
        JSON.stringify([...records, record]),
      ).byteLength;
      if (records.length >= 10 || bytes > 1024 * 1024) {
        tx.abort();
        return;
      }
      store.put(record);
    };
  });
}
export async function findRecovery(
  environmentId: string,
  id: string,
): Promise<RecoveryDraft | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly"),
      request = tx.objectStore("drafts").get(keyOf(environmentId, id));
    request.onsuccess = () => {
      const parsed = RecoverySchema.safeParse(request.result);
      resolve(parsed.success ? parsed.data : undefined);
    };
    request.onerror = () => reject(request.error);
  });
}
export async function clearRecovery(
  environmentId: string,
  id: string,
  confirmedText: string,
): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite"),
      store = tx.objectStore("drafts"),
      request = store.get(keyOf(environmentId, id));
    request.onsuccess = () => {
      if (request.result?.text === confirmedText)
        store.delete(keyOf(environmentId, id));
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
