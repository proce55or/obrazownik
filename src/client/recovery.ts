import { z } from "zod";
import type { RecoveryDraft } from "../domain/draft-queue";

const RecoverySchema = z.object({
  key: z.string(),
  id: z.uuid(),
  environmentId: z.uuid(),
  copyId: z.uuid().optional(),
  baseRevision: z.number().int().nonnegative(),
  text: z.string().max(50_000),
  scaffolding: z
    .record(z.string().max(80), z.string().max(4000))
    .refine((value) => Object.keys(value).length <= 12)
    .optional(),
  updatedAt: z.iso.datetime(),
});
type RecoveryRecord = z.infer<typeof RecoverySchema>;

// A fresh JavaScript realm gets a fresh identity, including a duplicated tab.
// sessionStorage is deliberately avoided: browsers may clone it into new tabs.
const pageCopyId = crypto.randomUUID();
export const recoveryKey = (
  environmentId: string,
  id: string,
  copyId: string,
) => `${environmentId}:${id}:${copyId}`;

function validRecords(records: unknown[]): RecoveryRecord[] {
  return records.flatMap((value) => {
    const parsed = RecoverySchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

export function chooseRecovery(
  records: unknown[],
  environmentId: string,
  id: string,
): RecoveryRecord | undefined {
  // Legacy records have no copyId and keep their original env:attempt key.
  return validRecords(records)
    .filter(
      (record) => record.environmentId === environmentId && record.id === id,
    )
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
        a.key.localeCompare(b.key),
    )[0];
}

export function confirmedRecoveryKeys(
  records: unknown[],
  environmentId: string,
  id: string,
  confirmedText: string,
  confirmedScaffolding?: Record<string, string>,
): string[] {
  return validRecords(records)
    .filter(
      (record) =>
        record.environmentId === environmentId &&
        record.id === id &&
        record.text === confirmedText &&
        (confirmedScaffolding === undefined ||
          sameScaffolding(record.scaffolding ?? {}, confirmedScaffolding)),
    )
    .map((record) => record.key);
}

function sameScaffolding(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key])
  );
}

export function prepareRecoveryWrite(
  records: unknown[],
  draft: RecoveryDraft,
  copyId: string,
): RecoveryRecord {
  const key = recoveryKey(draft.environmentId, draft.id, copyId);
  const record = RecoverySchema.parse({ ...draft, key, copyId });
  const others = records.filter(
    (value) =>
      !(
        typeof value === "object" &&
        value !== null &&
        "key" in value &&
        value.key === key
      ),
  );
  // Count every existing entry, even malformed ones. Never evict an unknown or
  // unconfirmed copy merely to make room for this tab.
  const bytes = new TextEncoder().encode(
    JSON.stringify([...others, record]),
  ).byteLength;
  if (others.length >= 10 || bytes > 1024 * 1024) {
    throw new Error(
      "Bufor ratunkowy jest pełny. Skopiuj tekst przed zamknięciem.",
    );
  }
  return record;
}

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
    const request = store.getAll();
    request.onsuccess = () => {
      try {
        store.put(prepareRecoveryWrite(request.result, draft, pageCopyId));
      } catch {
        // Aborting keeps every previous tab's copy untouched and is surfaced
        // through the existing buffer warning in the editor.
        tx.abort();
      }
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
      request = tx.objectStore("drafts").getAll();
    request.onsuccess = () =>
      resolve(chooseRecovery(request.result, environmentId, id));
    request.onerror = () => reject(request.error);
    tx.onabort = () =>
      reject(
        tx.error ?? new Error("Nie udało się odczytać kopii ratunkowych."),
      );
  });
}
export async function clearRecovery(
  environmentId: string,
  id: string,
  confirmedText: string,
  confirmedScaffolding?: Record<string, string>,
): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite"),
      store = tx.objectStore("drafts"),
      request = store.getAll();
    request.onsuccess = () => {
      for (const key of confirmedRecoveryKeys(
        request.result,
        environmentId,
        id,
        confirmedText,
        confirmedScaffolding,
      )) {
        store.delete(key);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(
        tx.error ?? new Error("Nie udało się potwierdzić kopii ratunkowej."),
      );
  });
}
