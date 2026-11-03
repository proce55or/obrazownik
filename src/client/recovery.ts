import { z } from "zod";
import type { RecoveryDraft } from "../domain/draft-queue";

const RecoverySchema = z
  .object({
    key: z.string(),
    id: z.uuid(),
    environmentId: z.uuid(),
    copyId: z.uuid().optional(),
    baseRevision: z.number().int().nonnegative(),
    text: z.string().max(50_000),
    title: z.string().max(200).optional(),
    scaffolding: z
      .record(z.string().max(80), z.string().max(4000))
      .refine((value) => Object.keys(value).length <= 12)
      .optional(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
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
  confirmedTitle?: string,
): string[] {
  return validRecords(records)
    .filter(
      (record) =>
        record.environmentId === environmentId &&
        record.id === id &&
        record.text === confirmedText &&
        (record.title === undefined || record.title === confirmedTitle) &&
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
  const existing = records.find(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "key" in value &&
      value.key === key,
  );
  if (existing && !RecoverySchema.safeParse(existing).success)
    throw new Error(
      "W tym miejscu jest kopia w nieznanym formacie. Zachowaj ją w Ustawieniach przed dalszym zapisem do bufora.",
    );
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

const IO_TIMEOUT = 4000;
let dbPromise: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(
        new Error(
          "Odczyt kopii ratunkowej trwa zbyt długo. Możesz nadal pisać i zapisywać.",
        ),
      );
    }, IO_TIMEOUT);
    try {
      const request = indexedDB.open("obrazownik-recovery-v1", 1);
      const fail = () => {
        clearTimeout(timer);
        settled = true;
        reject(request.error ?? new Error("Bufor ratunkowy jest niedostępny."));
      };
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("drafts"))
          request.result.createObjectStore("drafts", { keyPath: "key" });
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        request.result.onversionchange = () => {
          request.result.close();
          dbPromise = undefined;
        };
        resolve(request.result);
      };
      request.onerror = fail;
      request.onblocked = () => {
        clearTimeout(timer);
        settled = true;
        reject(
          new Error(
            "Bufor ratunkowy jest zablokowany. Zamknij starsze karty aplikacji i ponów odczyt.",
          ),
        );
      };
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
  dbPromise = pending;
  void pending.catch(() => {
    if (dbPromise === pending) dbPromise = undefined;
  });
  return pending;
}
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, setResult: (value: T) => void) => void,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    let tx: IDBTransaction;
    try {
      tx = db.transaction("drafts", mode);
    } catch (error) {
      dbPromise = undefined;
      reject(error);
      return;
    }
    const timer = setTimeout(() => {
      try {
        tx.abort();
      } catch {
        /* already closed */
      }
      reject(
        new Error(
          "Bufor ratunkowy nie odpowiada. Możesz nadal zapisywać na komputerze.",
        ),
      );
    }, IO_TIMEOUT);
    tx.oncomplete = () => {
      clearTimeout(timer);
      resolve(result);
    };
    const fail = () => {
      clearTimeout(timer);
      reject(
        tx.error ??
          new Error(
            "Bufor ratunkowy jest pełny lub niedostępny. Kopie znajdziesz w Ustawieniach.",
          ),
      );
    };
    tx.onerror = fail;
    tx.onabort = fail;
    try {
      work(tx.objectStore("drafts"), (value) => {
        result = value;
      });
    } catch (error) {
      clearTimeout(timer);
      tx.abort();
      reject(error);
    }
  });
}
export async function putRecovery(draft: RecoveryDraft): Promise<void> {
  return withStore<void>("readwrite", (store) => {
    const request = store.getAll();
    request.onsuccess = () => {
      try {
        store.put(prepareRecoveryWrite(request.result, draft, pageCopyId));
      } catch {
        store.transaction.abort();
      }
    };
  });
}
export async function findRecovery(
  environmentId: string,
  id: string,
): Promise<RecoveryDraft | undefined> {
  return withStore("readonly", (store, result) => {
    const request = store.getAll();
    request.onsuccess = () =>
      result(chooseRecovery(request.result, environmentId, id));
  });
}
export async function clearRecovery(
  environmentId: string,
  id: string,
  confirmedText: string,
  confirmedScaffolding?: Record<string, string>,
  confirmedTitle?: string,
): Promise<void> {
  return withStore<void>("readwrite", (store) => {
    const request = store.getAll();
    request.onsuccess = () => {
      for (const key of confirmedRecoveryKeys(
        request.result,
        environmentId,
        id,
        confirmedText,
        confirmedScaffolding,
        confirmedTitle,
      ))
        store.delete(key);
    };
  });
}
export async function listRecovery(
  environmentId?: string,
): Promise<RecoveryRecord[]> {
  return withStore("readonly", (store, result) => {
    const request = store.getAll();
    request.onsuccess = () =>
      result(
        validRecords(request.result)
          .filter((r) => !environmentId || r.environmentId === environmentId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
  });
}
// Delete only the exact reviewed copy; another tab may have updated it meanwhile.
export async function removeRecovery(copy: RecoveryRecord): Promise<void> {
  return withStore<void>("readwrite", (store) => {
    const request = store.get(copy.key);
    request.onsuccess = () => {
      const parsed = RecoverySchema.safeParse(request.result);
      if (
        !parsed.success ||
        JSON.stringify(parsed.data) !== JSON.stringify(copy)
      ) {
        store.transaction.abort();
        return;
      }
      store.delete(copy.key);
    };
  });
}

export interface UnknownRecoveryCopy {
  key: IDBValidKey;
  json?: string;
}

// JSON export must be lossless. Stringify alone silently drops undefined
// properties and conflates dates, non-finite numbers and strings.
function isExactJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number")
    return Number.isFinite(value) && !Object.is(value, -0);
  if (
    typeof value !== "object" ||
    ancestors.has(value) ||
    ancestors.size >= 100
  )
    return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value))
    return (
      Object.keys(value).length === value.length &&
      Array.from(
        { length: value.length },
        (_, index) =>
          Object.hasOwn(value, index) && isExactJson(value[index], next),
      ).every(Boolean)
    );
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  return Object.values(value).every((item) => isExactJson(item, next));
}

function jsonKey(key: IDBValidKey): unknown {
  if (typeof key === "string") return { type: "string", value: key };
  if (typeof key === "number") return { type: "number", value: String(key) };
  if (key instanceof Date) return { type: "date", value: key.toISOString() };
  if (Array.isArray(key)) return { type: "array", value: key.map(jsonKey) };
  const bytes = ArrayBuffer.isView(key)
    ? new Uint8Array(key.buffer, key.byteOffset, key.byteLength)
    : new Uint8Array(key);
  return { type: "binary", value: Array.from(bytes) };
}

export function unknownRecoveryCopy(
  key: IDBValidKey,
  value: unknown,
): UnknownRecoveryCopy | undefined {
  if (RecoverySchema.safeParse(value).success) return;
  const copy: UnknownRecoveryCopy = { key };
  if (isExactJson(value))
    copy.json = JSON.stringify(
      {
        format: "obrazownik-raw-recovery",
        primaryKey: jsonKey(key),
        record: value,
      },
      null,
      2,
    );
  return copy;
}

export function sameUnknownRecovery(
  copy: UnknownRecoveryCopy,
  currentValue: unknown,
): boolean {
  return (
    copy.json !== undefined &&
    unknownRecoveryCopy(copy.key, currentValue)?.json === copy.json
  );
}

export async function listUnknownRecovery(): Promise<UnknownRecoveryCopy[]> {
  return withStore("readonly", (store, result) => {
    const copies: UnknownRecoveryCopy[] = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        result(copies);
        return;
      }
      const copy = unknownRecoveryCopy(cursor.primaryKey, cursor.value);
      if (copy) copies.push(copy);
      cursor.continue();
    };
  });
}

export async function removeUnknownRecovery(
  copy: UnknownRecoveryCopy,
): Promise<void> {
  if (copy.json === undefined)
    throw new Error("Tej kopii nie można bezpiecznie zachować w JSON.");
  return withStore<void>("readwrite", (store) => {
    const request = store.get(copy.key);
    request.onsuccess = () => {
      // Compare and delete under one write transaction, including unknown fields.
      if (!sameUnknownRecovery(copy, request.result)) {
        store.transaction.abort();
        return;
      }
      store.delete(copy.key);
    };
  });
}
