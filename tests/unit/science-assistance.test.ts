import { expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  DraftQueue,
  type RecoveryDraft,
} from "../../src/domain/draft-queue.js";
import { AttemptSchema, type SaveAttempt } from "../../src/shared/schemas.js";
import { assistanceState } from "../../src/domain/assistance.js";
import {
  AssistanceSchema,
  type AssistanceEvent,
} from "../../src/shared/schemas.js";

function event(status: AssistanceEvent["status"], level = 1): AssistanceEvent {
  return AssistanceSchema.parse({
    id: randomUUID(),
    attemptId: randomUUID(),
    level,
    kind: level === 3 ? "example" : "question",
    revealedContentSnapshot: "Własna testowa wskazówka.",
    requestedAt: "2026-11-02T20:00:00.000Z",
    deliveredAt: status === "delivered" ? "2026-11-02T20:00:01.000Z" : null,
    status,
  });
}

test.each([
  ["known", [], "none_confirmed"],
  ["unknown", [], "unknown"],
  ["known", [event("failed")], "none_confirmed"],
  ["unknown", [event("failed")], "unknown"],
  ["known", [event("prepared")], "unknown"],
  ["unknown", [event("prepared")], "unknown"],
  ["known", [event("delivered")], "assisted"],
  ["unknown", [event("delivered")], "assisted"],
  ["known", [event("delivered"), event("prepared", 3)], "unknown"],
] as const)(
  "tracking=%s and event history retain state %s",
  (tracking, events, expected) => {
    expect(assistanceState({ assistanceTracking: tracking }, [...events])).toBe(
      expected,
    );
  },
);

test("a delivered example never yields confirmed independence even after a panel is closed", () => {
  const history = [event("delivered", 3)];
  expect(assistanceState({ assistanceTracking: "known" }, history)).toBe(
    "assisted",
  );
  // Panel visibility is intentionally absent from the domain function's inputs.
  expect(assistanceState({ assistanceTracking: "unknown" }, history)).toBe(
    "assisted",
  );
});

function blankAttempt() {
  return AttemptSchema.parse({
    id: randomUUID(),
    sessionId: null,
    cardId: "m4-verb-02",
    cardVersion: 1,
    promptSnapshot: {
      title: "Szukać",
      stimulus: "szukać",
      instruction: "Własna scena.",
    },
    family: "verb",
    partition: "training",
    mode: "training",
    status: "draft",
    revision: 0,
    currentText: "",
    createdAt: "2026-11-02T20:00:00.000Z",
    updatedAt: "2026-11-02T20:00:00.000Z",
    completedAt: null,
    sourceAttemptId: null,
    constraints: [],
    selfRatings: null,
  });
}

test("fields-only autosave persists and clears only the acknowledged text-and-fields rescue copy", async () => {
  const attempt = blankAttempt(),
    fields = { who: "Żółw", object: "źdźbła" };
  const clear = vi
      .fn<(text: string, fields?: Record<string, string>) => Promise<void>>()
      .mockResolvedValue(undefined),
    recovery = vi
      .fn<(draft: RecoveryDraft) => Promise<void>>()
      .mockResolvedValue(undefined);
  const send = vi.fn(async (input: SaveAttempt) => ({
    ...attempt,
    currentText: input.text,
    scaffolding: input.scaffolding ?? {},
    revision: input.expectedRevision + 1,
  }));
  const queue = new DraftQueue({
    attempt,
    environmentId: randomUUID(),
    send,
    putRecovery: recovery,
    clearRecovery: clear,
    onStatus: () => {},
    onAck: () => {},
    onBufferError: () => {},
  });
  queue.setScaffolding(fields);
  expect(queue.dirty).toBe(true);
  await queue.flush();
  await queue.settleRecovery();
  expect(send.mock.calls[0][0]).toMatchObject({
    text: "",
    scaffolding: fields,
    expectedRevision: 0,
  });
  expect(clear).toHaveBeenCalledWith("", fields);
  expect(recovery.mock.calls[0][0]).toMatchObject({
    text: "",
    scaffolding: fields,
  });
  expect(queue.dirty).toBe(false);
  queue.dispose();
});

test("changes to helper fields during a pending request form a separate revision instead of disappearing", async () => {
  const attempt = blankAttempt(),
    firstFields = { who: "Wiatr" },
    nextFields = { who: "Człowiek", object: "źdźbła" };
  let resolveFirst: (value: typeof attempt) => void = () => {};
  const first = new Promise<typeof attempt>((resolve) => {
    resolveFirst = resolve;
  });
  const send = vi.fn(async (input: SaveAttempt) => ({
    ...attempt,
    currentText: input.text,
    scaffolding: input.scaffolding ?? {},
    revision: input.expectedRevision + 1,
  }));
  send.mockImplementationOnce(() => first);
  const clear = vi
    .fn<(text: string, fields?: Record<string, string>) => Promise<void>>()
    .mockResolvedValue(undefined);
  const queue = new DraftQueue({
    attempt,
    environmentId: randomUUID(),
    send,
    putRecovery: async () => {},
    clearRecovery: clear,
    onStatus: () => {},
    onAck: () => {},
    onBufferError: () => {},
  });
  queue.setScaffolding(firstFields);
  const flushing = queue.flush();
  queue.setScaffolding(nextFields);
  expect(send).toHaveBeenCalledTimes(1);
  resolveFirst({ ...attempt, scaffolding: firstFields, revision: 1 });
  await flushing;
  await queue.settleRecovery();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0]).toMatchObject({
    scaffolding: nextFields,
    expectedRevision: 1,
  });
  expect(clear).toHaveBeenCalledExactlyOnceWith("", nextFields);
  expect(queue.currentRevision).toBe(2);
  expect(queue.dirty).toBe(false);
  queue.dispose();
});
