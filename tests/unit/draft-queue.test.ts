import { afterEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  DraftQueue,
  type RecoveryDraft,
  type SaveStatus,
} from "../../src/domain/draft-queue.js";
import {
  AttemptSchema,
  type Attempt,
  type SaveAttempt,
} from "../../src/shared/schemas.js";
function sample(): Attempt {
  return AttemptSchema.parse({
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
  });
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

test("typing coalesces recovery writes and explicit settling keeps the latest text", async () => {
  vi.useFakeTimers();
  const f = fixture();
  for (let i = 0; i < 100; i++) f.queue.setText("x".repeat(i + 1));
  expect(f.buffer()).toBeUndefined();
  await f.queue.settleRecovery();
  expect(f.buffer()?.text).toBe("x".repeat(100));
  expect(f.transport).not.toHaveBeenCalled();
  f.queue.dispose();
});

test("title edits share autosave revision and recovery with the document body", async () => {
  const document = {
    id: randomUUID(),
    revision: 2,
    currentText: "Treść",
    title: "Stary tytuł",
  };
  let copy: RecoveryDraft | undefined;
  const send = vi.fn(async (input: SaveAttempt & { title?: string }) => ({
    ...document,
    currentText: input.text,
    title: input.title!,
    revision: input.expectedRevision + 1,
  }));
  const queue = new DraftQueue({
    attempt: document,
    environmentId: randomUUID(),
    send,
    putRecovery: async (draft) => {
      copy = draft;
    },
    clearRecovery: async () => {
      copy = undefined;
    },
    onStatus: () => {},
    onAck: () => {},
    onBufferError: () => {},
  });
  queue.setTitle("Nowy tytuł");
  await queue.settleRecovery();
  expect(copy).toMatchObject({ text: "Treść", title: "Nowy tytuł" });
  await queue.flush();
  await queue.settleRecovery();
  expect(send.mock.calls[0][0]).toMatchObject({
    text: "Treść",
    title: "Nowy tytuł",
    expectedRevision: 2,
  });
  expect(queue.dirty).toBe(false);
  expect(copy).toBeUndefined();
  queue.dispose();
});

test("a deterministic refusal releases the mutation so newer edits can be saved", async () => {
  const f = fixture();
  f.transport.mockRejectedValueOnce(
    Object.assign(new Error("Refused"), {
      uncertain: false,
      code: "card_version",
    }),
  );
  f.queue.setText("Pierwszy");
  await expect(f.queue.flush()).rejects.toThrow("Refused");
  const refused = f.transport.mock.calls[0][0];
  f.queue.setText("Poprawiony");
  await f.queue.flush();
  expect(f.transport.mock.calls[1][0].text).toBe("Poprawiony");
  expect(f.transport.mock.calls[1][0].clientMutationId).not.toBe(
    refused.clientMutationId,
  );
  f.queue.dispose();
});

test("continuous typing cannot postpone the rescue buffer indefinitely", async () => {
  vi.useFakeTimers();
  const f = fixture();
  for (let i = 0; i < 10; i++) {
    f.queue.setText(String(i));
    await vi.advanceTimersByTimeAsync(100);
    if (i === 4) expect(f.buffer()?.text).toBe("4");
  }
  expect(f.buffer()?.text).toBe("9");
  expect(f.transport).not.toHaveBeenCalled();
  f.queue.dispose();
});

test("reverting to the acknowledged answer leaves no stale rescue copy after a guided stage change", async () => {
  const f = fixture();
  const original = "Kamień jest szorstki.";
  f.queue.setText(original);
  await f.queue.flush();
  await f.queue.settleRecovery();
  f.queue.setText(original + " ");
  await f.queue.settleRecovery();
  expect(f.buffer()?.text).toBe(original + " ");
  f.queue.setText(original);
  await f.queue.flush();
  // The next stage has the same attempt id but an empty response field.
  f.queue.acceptRevision({ ...f.attempt, revision: 2, currentText: "" });
  await f.queue.settleRecovery();
  f.queue.dispose();
  await f.queue.settleRecovery();
  expect(f.transport).toHaveBeenCalledTimes(1);
  expect(f.buffer()).toBeUndefined();
});

test("reverting during an uncertain write still preserves recovery until the mutation is confirmed", async () => {
  const f = fixture();
  f.transport.mockRejectedValueOnce(new Error("Lost response"));
  f.queue.setText("Niezapisana odpowiedź");
  await expect(f.queue.flush()).rejects.toThrow("Lost response");
  f.queue.setText("");
  await f.queue.settleRecovery();
  expect(f.queue.dirty).toBe(true);
  expect(f.buffer()?.text).toBe("");
  await f.queue.flush();
  await f.queue.settleRecovery();
  expect(f.transport.mock.calls[1][0]).toEqual(f.transport.mock.calls[0][0]);
  expect(f.transport.mock.calls[2][0].text).toBe("");
  expect(f.buffer()).toBeUndefined();
  f.queue.dispose();
});
