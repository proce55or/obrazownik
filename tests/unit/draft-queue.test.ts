import { afterEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  DraftQueue,
  type RecoveryDraft,
  type SaveStatus,
} from "../../src/domain/draft-queue.js";
import type { Attempt, SaveAttempt } from "../../src/shared/schemas.js";
function sample(): Attempt {
  return {
    id: randomUUID(),
    sessionId: null,
    cardId: "property-stone-01",
    cardVersion: 1,
    promptSnapshot: {
      title: "Test",
      stimulus: "Kamień",
      instruction: "Zapisz szczegół.",
    },
    family: "property",
    partition: "training",
    mode: "training",
    status: "draft",
    revision: 0,
    currentText: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    sourceAttemptId: null,
    constraints: [],
    selfRatings: null,
  };
}
function fixture(send?: (input: SaveAttempt) => Promise<Attempt>) {
  const attempt = sample();
  let buffer: RecoveryDraft | undefined;
  const statuses: SaveStatus[] = [];
  const transport = vi.fn(
    send ??
      (async (input) => ({
        ...attempt,
        currentText: input.text,
        revision: input.expectedRevision + 1,
      })),
  );
  const queue = new DraftQueue({
    attempt,
    environmentId: randomUUID(),
    send: transport,
    putRecovery: async (value) => {
      buffer = value;
    },
    clearRecovery: async (text) => {
      if (buffer?.text === text) buffer = undefined;
    },
    onStatus: (value) => statuses.push(value),
    onAck: () => {},
    onBufferError: () => {},
  });
  return { queue, transport, statuses, buffer: () => buffer, attempt };
}
afterEach(() => vi.useRealTimers());
test("600ms debounce; serial writes merge edits made during an in-flight save", async () => {
  vi.useFakeTimers();
  let resolveFirst: (value: Attempt) => void = () => {};
  const first = new Promise<Attempt>((resolve) => {
    resolveFirst = resolve;
  });
  const f = fixture();
  f.transport.mockImplementationOnce(() => first);
  f.queue.setText("A");
  await vi.advanceTimersByTimeAsync(599);
  expect(f.transport).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(f.transport).toHaveBeenCalledTimes(1);
  f.queue.setText("B\nŻółć");
  const flushed = f.queue.flush();
  expect(f.transport).toHaveBeenCalledTimes(1);
  resolveFirst({ ...f.attempt, revision: 1, currentText: "A" });
  await flushed;
  await f.queue.settleRecovery();
  expect(f.transport).toHaveBeenCalledTimes(2);
  expect(f.transport.mock.calls[1][0]).toMatchObject({
    text: "B\nŻółć",
    expectedRevision: 1,
  });
  expect(f.queue.currentRevision).toBe(2);
  expect(f.queue.dirty).toBe(false);
  expect(f.buffer()).toBeUndefined();
  f.queue.dispose();
});
test("uncertain network response retries the same mutation before newer edits", async () => {
  const f = fixture();
  f.transport.mockRejectedValueOnce(new Error("Lost response"));
  f.queue.setText("pierwszy");
  await expect(f.queue.flush()).rejects.toThrow("Lost response");
  await f.queue.settleRecovery();
  expect(f.buffer()?.text).toBe("pierwszy");
  expect(f.statuses.at(-1)).toBe("error");
  const first = f.transport.mock.calls[0][0];
  f.queue.setText("drugi");
  await f.queue.flush();
  expect(f.transport.mock.calls[1][0]).toEqual(first);
  expect(f.transport.mock.calls[2][0]).toMatchObject({
    text: "drugi",
    expectedRevision: 1,
  });
  expect(f.statuses.at(-1)).toBe("saved");
  f.queue.dispose();
});
test("conflict preserves the rescue draft and prevents automatic overwriting", async () => {
  const f = fixture();
  f.transport.mockRejectedValueOnce(
    Object.assign(new Error("Conflict"), { code: "revision_conflict" }),
  );
  f.queue.setText("Moje słowa");
  await expect(f.queue.flush()).rejects.toThrow("Conflict");
  await f.queue.settleRecovery();
  expect(f.buffer()?.text).toBe("Moje słowa");
  await expect(f.queue.flush()).rejects.toThrow(/wersję/);
  expect(f.transport).toHaveBeenCalledTimes(1);
  expect(f.statuses.at(-1)).toBe("conflict");
  f.queue.dispose();
});
