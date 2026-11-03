import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  chooseRecovery,
  confirmedRecoveryKeys,
  sameUnknownRecovery,
  prepareRecoveryWrite,
  unknownRecoveryCopy,
} from "../../src/client/recovery.js";

test("unknown JSON fields are exported intact and prevent automatic confirmation", () => {
  const environmentId = randomUUID(),
    id = randomUUID();
  const record = {
    key: "future-copy",
    environmentId,
    id,
    baseRevision: 2,
    text: "Niezapisany żółty tekst.",
    updatedAt: "2026-11-03T10:00:00Z",
    futureFields: { title: "Przyszły tytuł", fragments: ["pierwszy", "drugi"] },
  };
  const copy = unknownRecoveryCopy(record.key, record)!;
  expect(JSON.parse(copy.json!).record).toEqual(record);
  expect(chooseRecovery([record], environmentId, id)).toBeUndefined();
  expect(
    confirmedRecoveryKeys([record], environmentId, id, record.text),
  ).toEqual([]);
  expect(sameUnknownRecovery(copy, structuredClone(record))).toBe(true);
  expect(
    sameUnknownRecovery(copy, {
      ...record,
      futureFields: { ...record.futureFields, title: "Nowszy tytuł" },
    }),
  ).toBe(false);
  expect(sameUnknownRecovery(copy, undefined)).toBe(false);
});

test("non-string keys remain distinct in JSON snapshots", () => {
  const numeric = unknownRecoveryCopy(12, {
    key: 12,
    text: "Nieznany format",
  })!;
  const string = unknownRecoveryCopy("12", {
    key: "12",
    text: "Nieznany format",
  })!;
  expect(JSON.parse(numeric.json!).primaryKey).toEqual({
    type: "number",
    value: "12",
  });
  expect(numeric.json).not.toBe(string.json);
  const composite = unknownRecoveryCopy(["copy", 3], {
    key: ["copy", 3],
    extra: null,
  })!;
  expect(
    sameUnknownRecovery(composite, { key: ["copy", 3], extra: null }),
  ).toBe(true);
});

test("lossy JSON never authorizes deleting a raw copy", () => {
  const cyclic: Record<string, unknown> = { key: "cycle" };
  cyclic.self = cyclic;
  for (const value of [
    { key: "date", date: new Date() },
    { key: "undefined", text: undefined },
    { key: "number", text: Number.NaN },
    { key: "bigint", count: 1n },
    { key: "binary", content: new Uint8Array([1, 2]) },
    cyclic,
  ]) {
    const copy = unknownRecoveryCopy("raw", value)!;
    expect(copy.json).toBeUndefined();
    expect(sameUnknownRecovery(copy, value)).toBe(false);
  }
});

test("writing this tab cannot replace an unknown record under its key", () => {
  const environmentId = randomUUID(),
    id = randomUUID(),
    copyId = randomUUID();
  const draft = {
    environmentId,
    id,
    baseRevision: 0,
    text: "Nowy tekst",
    updatedAt: "2026-11-03T10:00:00Z",
  };
  const key = `${environmentId}:${id}:${copyId}`;
  const unknown = {
    key,
    text: "Wcześniejszy niezrozumiały tekst",
    future: true,
  };
  expect(() => prepareRecoveryWrite([unknown], draft, copyId)).toThrow(
    /nieznanym formacie/,
  );
  expect(unknown.text).toBe("Wcześniejszy niezrozumiały tekst");
});
