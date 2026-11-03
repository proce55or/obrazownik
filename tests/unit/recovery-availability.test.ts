import { afterEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { findRecovery } from "../../src/client/recovery.js";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test("a rejected database open can be retried in the same page", async () => {
  const open = vi.fn(() => {
    throw new Error("Unavailable");
  });
  vi.stubGlobal("indexedDB", { open });
  const env = randomUUID(),
    id = randomUUID();
  await expect(findRecovery(env, id)).rejects.toThrow("Unavailable");
  await expect(findRecovery(env, id)).rejects.toThrow("Unavailable");
  expect(open).toHaveBeenCalledTimes(2);
});
test("an unresolved database open times out and permits another attempt", async () => {
  vi.useFakeTimers();
  const open = vi.fn(() => ({}));
  vi.stubGlobal("indexedDB", { open });
  const operation = expect(
    findRecovery(randomUUID(), randomUUID()),
  ).rejects.toThrow(/zbyt długo/);
  await vi.advanceTimersByTimeAsync(4000);
  await operation;
  const retry = expect(
    findRecovery(randomUUID(), randomUUID()),
  ).rejects.toThrow(/zbyt długo/);
  await vi.advanceTimersByTimeAsync(4000);
  await retry;
  expect(open).toHaveBeenCalledTimes(2);
});
