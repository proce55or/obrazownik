import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import {
  chooseRecovery,
  confirmedRecoveryKeys,
  prepareRecoveryWrite,
  recoveryKey,
} from "../../src/client/recovery.js";
import type { RecoveryDraft } from "../../src/domain/draft-queue.js";

function fixture() {
  const environmentId = randomUUID(),
    id = randomUUID();
  const draft: RecoveryDraft = {
    id,
    environmentId,
    baseRevision: 3,
    text: "Moja żółć.\nDrugi wers.",
    updatedAt: "2026-11-02T20:00:00.000Z",
  };
  return { draft, environmentId, id };
}

test("two tabs keep distinct unconfirmed texts and overwriting one tab leaves the other intact", () => {
  const { draft, environmentId, id } = fixture();
  const firstCopy = randomUUID(),
    secondCopy = randomUUID();
  const first = prepareRecoveryWrite([], draft, firstCopy);
  const second = prepareRecoveryWrite(
    [first],
    { ...draft, text: "Inne słowa.", updatedAt: "2026-11-02T20:01:00.000Z" },
    secondCopy,
  );
  expect(first.key).not.toBe(second.key);
  const replacement = prepareRecoveryWrite(
    [first, second],
    { ...draft, text: "Dalsze własne słowa." },
    firstCopy,
  );
  expect(replacement.key).toBe(first.key);
  expect(second.text).toBe("Inne słowa.");
  expect(chooseRecovery([replacement, second], environmentId, id)).toEqual(
    second,
  );
  expect(
    confirmedRecoveryKeys(
      [replacement, second],
      environmentId,
      id,
      replacement.text,
    ),
  ).toEqual([first.key]);
});

test("legacy copies remain recoverable; exact confirmation does not delete other texts or environments", () => {
  const { draft, environmentId, id } = fixture();
  const legacy = { ...draft, key: `${environmentId}:${id}` };
  const current = prepareRecoveryWrite(
    [legacy],
    { ...draft, text: " Nowy tekst. " },
    randomUUID(),
  );
  const foreign = prepareRecoveryWrite(
    [],
    { ...draft, environmentId: randomUUID() },
    randomUUID(),
  );
  expect(chooseRecovery([legacy], environmentId, id)).toEqual(legacy);
  expect(
    confirmedRecoveryKeys(
      [legacy, current, foreign],
      environmentId,
      id,
      draft.text,
    ),
  ).toEqual([legacy.key]);
  expect(
    confirmedRecoveryKeys([current], environmentId, id, current.text.trim()),
  ).toEqual([]);
  expect(chooseRecovery([foreign], environmentId, id)).toBeUndefined();
  expect(recoveryKey(environmentId, id, current.copyId!)).toBe(current.key);
});

test("capacity limits reject a new copy without evicting old texts, while own-copy updates fit", () => {
  const { draft } = fixture();
  const records = Array.from({ length: 10 }, (_, i) =>
    prepareRecoveryWrite([], { ...draft, text: String(i) }, randomUUID()),
  );
  const before = structuredClone(records);
  expect(() => prepareRecoveryWrite(records, draft, randomUUID())).toThrow(
    /pełny/,
  );
  expect(records).toEqual(before);
  expect(prepareRecoveryWrite(records, draft, records[0].copyId!).key).toBe(
    records[0].key,
  );
  const oversized = [{ key: "unknown", text: "x".repeat(1024 * 1024) }];
  expect(() => prepareRecoveryWrite(oversized, draft, randomUUID())).toThrow(
    /pełny/,
  );
  expect(oversized[0].text.length).toBe(1024 * 1024);
});

test("latest copy uses chronology even when legacy timestamps omit milliseconds", () => {
  const { draft, environmentId, id } = fixture();
  const old = {
    ...draft,
    key: `${environmentId}:${id}`,
    updatedAt: "2026-11-02T20:00:00Z",
  };
  const newer = prepareRecoveryWrite(
    [old],
    { ...draft, updatedAt: "2026-11-02T20:00:00.999Z" },
    randomUUID(),
  );
  expect(chooseRecovery([old, newer], environmentId, id)).toEqual(newer);
});

test("same body with different scaffolding remains unconfirmed; legacy fields are treated as empty", () => {
  const { draft, environmentId, id } = fixture();
  const first = prepareRecoveryWrite(
    [],
    { ...draft, scaffolding: { who: "wiatr", what: "zapach" } },
    randomUUID(),
  );
  const other = prepareRecoveryWrite(
    [first],
    { ...draft, scaffolding: { who: "ktoś", what: "list" } },
    randomUUID(),
  );
  const legacy = { ...draft, key: `${environmentId}:${id}` };
  expect(
    confirmedRecoveryKeys(
      [first, other, legacy],
      environmentId,
      id,
      draft.text,
      { what: "zapach", who: "wiatr" },
    ),
  ).toEqual([first.key]);
  expect(
    confirmedRecoveryKeys(
      [first, other, legacy],
      environmentId,
      id,
      draft.text,
      {},
    ),
  ).toEqual([legacy.key]);
  expect(
    confirmedRecoveryKeys(
      [first, other, legacy],
      environmentId,
      id,
      draft.text,
    ),
  ).toEqual([first.key, other.key, legacy.key]);
  expect(chooseRecovery([first], environmentId, id)?.scaffolding).toEqual({
    who: "wiatr",
    what: "zapach",
  });
});
