import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Storage } from "../../src/server/storage.js";
import {
  GuidedFeedbackService,
  type GuidedFeedbackOptions,
} from "../../src/server/guided-feedback.js";
import { LocalHintService } from "../../src/server/local-llm.js";
const cleanup: (() => void | Promise<void>)[] = [];
const feedback = {
  quote: "szorstki",
  strength: "Słowo „szorstki” wskazuje odczucie dotyku.",
  improvement: "Możesz doprecyzować miejsce dotyku.",
  nextQuestion: "Gdzie czujesz szorstkość?",
  assessment: "met",
};
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture(options: GuidedFeedbackOptions = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "obrazownik-guided-service-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const store = await Storage.open(dir);
  cleanup.push(() => store.close());
  const manifestPath = path.join(dir, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      modelId: "bielik-7b-local",
      modelSha256: "a".repeat(64),
      modelPath: "/test/model.gguf",
    }),
  );
  const initial = store.createGuided(randomUUID()).attempt;
  const attempt = store.saveAttempt(initial.id, {
    text: "Kamień jest szorstki.",
    expectedRevision: initial.revision,
    clientMutationId: randomUUID(),
  });
  const service = new GuidedFeedbackService({
    manifestPath,
    probe: async () => true,
    generate: async () => JSON.stringify(feedback),
    ...options,
  });
  cleanup.push(() => service.close());
  return { dir, store, attempt, service, manifestPath };
}
test("only current answer and stage goal enter local generation; no shared private cache", async () => {
  let input = "";
  const f = await fixture({
    generate: async (prompt) => {
      input = prompt;
      return JSON.stringify(feedback);
    },
  });
  const before = readdirSync(f.dir).sort();
  const result = await f.service.generate({
    ...f.attempt,
    sourceText: "ARCHIVE_SENTINEL",
    scaffolding: { private: "SCAFFOLD_SENTINEL" },
  });
  expect(JSON.parse(input).answer).toBe(f.attempt.currentText);
  expect(input).not.toContain("SENTINEL");
  expect(result.feedback).toEqual(feedback);
  expect(result.llm).toMatchObject({
    modelId: "bielik-7b-local",
    cacheHit: false,
    promptVersion: "obrazownik-guided-1",
  });
  expect(readdirSync(f.dir).sort()).toEqual(before);
  const generic = new LocalHintService(f.dir, { manifestPath: f.manifestPath });
  cleanup.push(() => generic.close());
  expect(() => generic.prefetch(f.attempt)).toThrow();
  expect(generic.status(f.attempt).status).toBe("disabled");
});
test.each([
  "nie JSON",
  JSON.stringify({ ...feedback, quote: "gładki" }),
  JSON.stringify({ ...feedback, nextQuestion: "Napisz więcej." }),
  JSON.stringify({ ...feedback, strength: "<script>nie</script>" }),
  JSON.stringify({ ...feedback, assessment: "excellent" }),
])(
  "invalid or hallucinated feedback never reaches storage (%#)",
  async (raw) => {
    const f = await fixture({ generate: async () => raw });
    await expect(f.service.generate(f.attempt)).rejects.toMatchObject({
      code: "guided_generation_failed",
    });
    expect(f.store.detail(f.attempt.id).assistanceEvents).toHaveLength(0);
    expect(f.store.getAttempt(f.attempt.id).currentText).toBe(
      f.attempt.currentText,
    );
  },
);
test("protected, closed, empty and oversized answers are rejected before contacting model", async () => {
  let calls = 0;
  const f = await fixture({
    probe: async () => {
      calls++;
      return true;
    },
  });
  for (const override of [
    { mode: "independent" as const },
    { status: "completed" as const },
    { currentText: " " },
    { currentText: "x".repeat(1801) },
  ])
    await expect(
      f.service.generate({ ...f.attempt, ...override }),
    ).rejects.toBeDefined();
  expect(calls).toBe(0);
});
test("offline model never generates and leaves answer intact", async () => {
  let calls = 0;
  const f = await fixture({
    probe: async () => false,
    generate: async () => {
      calls++;
      return "";
    },
  });
  await expect(f.service.generate(f.attempt)).rejects.toMatchObject({
    code: "guided_unavailable",
    retryable: true,
  });
  expect(calls).toBe(0);
  expect(f.store.getAttempt(f.attempt.id).currentText).toBe(
    f.attempt.currentText,
  );
});
test("timeout cancels generation and rejects a second simultaneous request", async () => {
  let signal: AbortSignal | undefined;
  const f = await fixture({
    timeoutMs: 30,
    generate: async (_p, _m, s) => {
      signal = s;
      return new Promise<string>(() => {});
    },
  });
  const pending = expect(f.service.generate(f.attempt)).rejects.toMatchObject({
    code: "guided_generation_failed",
  });
  await expect(f.service.generate(f.attempt)).rejects.toMatchObject({
    code: "guided_busy",
  });
  await pending;
  expect(signal?.aborted).toBe(true);
});
test("closing aborts in-flight generation without accepting a late answer", async () => {
  let resolve!: (raw: string) => void;
  const f = await fixture({
    generate: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const pending = expect(f.service.generate(f.attempt)).rejects.toMatchObject({
    code: "guided_generation_failed",
  });
  await expect.poll(() => typeof resolve).toBe("function");
  await f.service.close();
  resolve(JSON.stringify(feedback));
  await pending;
  await expect(f.service.generate(f.attempt)).rejects.toMatchObject({
    code: "guided_unavailable",
  });
});
