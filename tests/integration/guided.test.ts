import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Storage } from '../../src/server/storage.js';
import { cards, allCards } from '../../src/server/content.js';
import { BundleSchema } from '../../src/shared/bundle.js';
import { GUIDED_CARD_ID, GUIDED_METHOD_ID, isGuidedFeedbackCurrent } from '../../src/shared/guided.js';
import type { Attempt, AttemptDetail } from '../../src/shared/schemas.js';
import { createApp } from '../../src/server/app.js';
import type { GuidedFeedbackOptions } from '../../src/server/guided-feedback.js';

const dirs: string[] = [];
const cleanups: (() => unknown | Promise<unknown>)[] = [];
const directory = () => {const dir = mkdtempSync(path.join(tmpdir(), 'obrazownik-guided-')); dirs.push(dir); return dir;};
async function open(dir = directory()) {const store = await Storage.open(dir); cleanups.push(() => store.close()); return store;}
const action = (attempt: Attempt) => ({expectedRevision: attempt.revision, clientMutationId: randomUUID()});
const feedback = {quote: 'chłodny', strength: 'Słowo „chłodny” daje czytelnikowi konkretne wrażenie dotyku.', improvement: 'Możesz dopowiedzieć, gdzie czujesz ten chłód.', nextQuestion: 'Gdzie czujesz chłód kamienia?', assessment: 'met' as const};
const llm = {modelId: 'bielik-7b-local', modelSha256: 'a'.repeat(64), promptVersion: 'obrazownik-guided-1', generatedAt: '2026-11-03T08:00:00.000Z', generationMs: 50, cacheHit: false};
const response = {feedback, llm};
afterEach(async () => {for (const close of cleanups.splice(0).reverse()) await close(); for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});});

test('three guided stages preserve answers, CAS, assistance provenance and idempotence without changing global mode', async () => {
  const store = await open();
  const requestId = randomUUID();
  let detail = store.createGuided(requestId);
  const id = detail.attempt.id;
  expect(store.createGuided(requestId)).toEqual(detail);
  expect(store.settings().llmMode).toBe('off');
  expect(detail.attempt).toMatchObject({cardId: GUIDED_CARD_ID, methodId: GUIDED_METHOD_ID, llmMode: 'bielik', mode: 'training', guided: {step: 0, history: [], feedback: null}});
  expect(() => store.finish(id, action(detail.attempt), 'completed')).toThrow(/trzy etapy/);
  for (let step = 0; step < 3; step++) {
    const text = ['Kamień jest chłodny.', 'Kamień jest chłodny jak szyba w zimie.', 'Kamień jest chłodny jak szyba w zimie. Woda obraca go pod palcami.'][step];
    const saved = store.saveAttempt(id, {text, ...action(detail.attempt)});
    const input = action(saved);
    detail = store.prepareGuidedFeedback(id, input, text, response);
    expect(store.prepareGuidedFeedback(id, input, text, response)).toEqual(detail);
    expect(detail.attempt.guided?.feedback).toMatchObject({step, answer: text, answerRevision: saved.revision, llm});
    const event = detail.assistanceEvents.at(-1)!;
    expect(event).toMatchObject({kind: 'guided_feedback', status: 'prepared', provider: 'bielik_local', llm});
    expect(detail.versions.at(-1)?.text).toBe(text);
    store.deliverHint(id, event.id);
    if (step < 2) {
      const input = action(detail.attempt);
      detail = store.nextGuided(id, input);
      expect(store.nextGuided(id, input)).toEqual(detail);
      expect(detail.attempt.currentText).toBe('');
      expect(detail.attempt.guided?.history[step].answer).toBe(text);
      expect(detail.attempt.guided?.feedback).toBeNull();
    }
  }
  const final = store.finish(id, action(detail.attempt), 'completed');
  expect(final.currentText).toContain('Woda obraca');
  expect(store.detail(id).assistanceState).toBe('assisted');
  const markdown = store.attemptMarkdown(id);
  expect(markdown).toContain('Etap 1: Zauważ jedną cechę');
  expect(markdown).toContain('Etap 3: Ożyw małą scenę');
  expect(markdown).toContain(feedback.strength);
  expect(markdown).toContain(llm.modelSha256);
  expect(store.exportData().reviews).toHaveLength(0);
  expect(() => store.nextGuided(id, action(final))).toThrow(/zakończone/);
  expect(() => store.reviseAttempt(id, randomUUID())).toThrow(/rozpocznij od Start/);
});

test('editing an answer preserves stale feedback and late feedback never overwrites a newer answer', async () => {
  const store = await open();
  let attempt = store.createGuided(randomUUID()).attempt;
  attempt = store.saveAttempt(attempt.id, {text: 'Kamień jest chłodny.', ...action(attempt)});
  const original = attempt;
  attempt = store.prepareGuidedFeedback(attempt.id, action(attempt), attempt.currentText, response).attempt;
  expect(isGuidedFeedbackCurrent(attempt)).toBe(true);
  attempt = store.saveAttempt(attempt.id, {text: 'Kamień jest chłodny na spodzie.', ...action(attempt)});
  expect(attempt.guided?.feedback?.answer).toBe(original.currentText);
  expect(isGuidedFeedbackCurrent(attempt)).toBe(false);
  expect(store.attemptMarkdown(attempt.id)).toContain('dotyczy wcześniejszej odpowiedzi');
  expect(() => store.nextGuided(attempt.id, action(attempt))).toThrow(/aktualnej odpowiedzi/);
  expect(() => store.prepareGuidedFeedback(attempt.id, action(original), original.currentText, response)).toThrow(/innej karcie/);
  expect(store.assistance(attempt.id)).toHaveLength(1);
  expect(store.getAttempt(attempt.id).currentText).toBe(attempt.currentText);
});

test('guided data survive restart, verified backup and import including remapped feedback event IDs', async () => {
  const dir = directory();
  let source = await Storage.open(dir);
  const id = source.createGuided(randomUUID()).attempt.id;
  let attempt = source.saveAttempt(id, {text: 'Kamień jest chłodny.', expectedRevision: 0, clientMutationId: randomUUID()});
  attempt = source.prepareGuidedFeedback(id, action(attempt), attempt.currentText, response).attempt;
  source.deliverHint(id, attempt.guided!.feedback!.eventId);
  attempt = source.nextGuided(id, action(attempt)).attempt;
  const before = source.detail(id);
  const backupFile = await source.backup();
  const backup = new DatabaseSync(path.join(dir, 'backups', backupFile), {readOnly: true});
  try {
    expect(backup.prepare('PRAGMA user_version').get()?.user_version).toBe(4);
    expect(JSON.parse(String(backup.prepare('SELECT record FROM attempts WHERE id=?').get(id)?.record)).guided).toEqual(attempt.guided);
  } finally {backup.close();}
  source.close();
  source = await open(dir);
  expect(source.detail(id)).toEqual(before);
  const target = await open(), bundle = source.exportData();
  expect(bundle.schemaVersion).toBe(4);
  await target.importData(bundle, target.previewImport(bundle).digest);
  expect(target.detail(id)).toEqual(before);
  const changed = structuredClone(bundle);
  changed.attempts[0].currentText = 'Nowy szkic porównania.';
  await target.importData(changed, target.previewImport(changed).digest);
  const imported = target.listAttempts().find(value => value.id !== id)!;
  const review = imported.guided!.history[0];
  expect(review.eventId).not.toBe(attempt.guided!.history[0].eventId);
  expect(target.assistance(imported.id).find(event => event.id === review.eventId)).toMatchObject({attemptId: imported.id, llm});
  expect(BundleSchema.safeParse(target.exportData()).success).toBe(true);
});

test('standard/protected attempts cannot use guided routes; import rejects forged guided identity and broken event references', async () => {
  const store = await open();
  for (const attempt of [store.createAttempt(cards[0], randomUUID()), store.createIndependent(allCards, randomUUID())]) {
    expect(() => store.checkGuided(attempt.id, attempt.revision)).toThrow(/nie jest ćwiczeniem/);
    expect(() => store.prepareGuidedFeedback(attempt.id, action(attempt), 'chłodny', response)).toThrow(/nie jest ćwiczeniem/);
    expect(store.assistance(attempt.id)).toHaveLength(0);
  }
  let attempt = store.createGuided(randomUUID()).attempt;
  attempt = store.saveAttempt(attempt.id, {text: 'Kamień jest chłodny.', ...action(attempt)});
  attempt = store.prepareGuidedFeedback(attempt.id, action(attempt), attempt.currentText, response).attempt;
  expect(() => store.prepareHint(attempt.id, {...action(attempt), level: 1}, 'Pytanie?')).toThrow();
  const bundle = store.exportData(), broken = structuredClone(bundle);
  broken.attempts.find(value => value.id === attempt.id)!.guided!.feedback!.eventId = randomUUID();
  expect(BundleSchema.safeParse(broken).success).toBe(false);
  const forged = structuredClone(bundle);
  forged.attempts.find(value => value.id === attempt.id)!.mode = 'independent';
  expect(BundleSchema.safeParse(forged).success).toBe(false);
});

async function api(options: GuidedFeedbackOptions = {}) {
  const dir = directory(), manifestPath = path.join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({modelId: llm.modelId, modelSha256: llm.modelSha256, modelPath: '/synthetic/model.gguf'}));
  const app = await createApp({dataDir: dir, serveClient: false, guidedLlm: {manifestPath, probe: async () => true, generate: async () => JSON.stringify(feedback), ...options}});
  cleanups.push(() => app.close());
  const headers = {host: '127.0.0.1:4317'}, bootstrap = await app.inject({url: '/api/bootstrap', headers});
  const auth = {...headers, origin: 'http://127.0.0.1:4317', cookie: bootstrap.cookies.map(c => `${c.name}=${c.value}`).join('; '), 'x-csrf-token': bootstrap.json().csrfToken};
  const get = (url: string) => app.inject({url: `/api${url}`, headers});
  const post = (url: string, payload: object, method: 'POST' | 'PATCH' = 'POST') => app.inject({url: `/api${url}`, method, payload, headers: auth});
  const start = await post('/guided/start', {clientRequestId: randomUUID()});
  expect(start.statusCode).toBe(200);
  const detail = start.json<AttemptDetail>();
  return {get, post, attempt: detail.attempt, base: `/attempts/${detail.attempt.id}`};
}

test('HTTP feedback deduplicates in-flight requests and persists prepared feedback only after CAS succeeds', async () => {
  let finish!: (value: string) => void, calls = 0;
  const f = await api({generate: async () => {calls++; return new Promise<string>(resolve => {finish = resolve;});}});
  const saved = (await f.post(f.base, {text: 'Kamień jest chłodny.', ...action(f.attempt)}, 'PATCH')).json<Attempt>();
  const input = action(saved);
  const pending = f.post(`${f.base}/guided/feedback`, input).then(value => value);
  await expect.poll(() => calls).toBe(1);
  const duplicate = f.post(`${f.base}/guided/feedback`, input).then(value => value);
  const busy = await f.post(`${f.base}/guided/feedback`, {...input, clientMutationId: randomUUID()});
  expect(busy.statusCode).toBe(409);
  expect(busy.json().error.code).toBe('guided_busy');
  finish(JSON.stringify(feedback));
  const first = await pending, second = await duplicate;
  expect(first.statusCode).toBe(200);
  expect(second.json()).toEqual(first.json());
  expect(calls).toBe(1);
  const shown = first.json<AttemptDetail>();
  expect(shown.attempt.guided?.feedback?.answer).toBe(saved.currentText);
  expect(shown.assistanceEvents).toHaveLength(1);
  expect((await f.post(`${f.base}/guided/feedback`, input)).json()).toEqual(shown);
  const nextInput = action(shown.attempt);
  const late = f.post(`${f.base}/guided/feedback`, nextInput).then(value => value);
  await expect.poll(() => calls).toBe(2);
  expect((await f.post(f.base, {text: 'Kamień jest chłodny od wody.', ...nextInput, clientMutationId: randomUUID()}, 'PATCH')).statusCode).toBe(200);
  finish(JSON.stringify(feedback));
  expect((await late).statusCode).toBe(409);
  const current = (await f.get(f.base)).json<AttemptDetail>();
  expect(current.attempt.currentText).toBe('Kamień jest chłodny od wody.');
  expect(current.assistanceEvents).toHaveLength(1);
});

test('HTTP rejects protected, blank and oversized input before generation; model failure keeps text and ordinary saving usable', async () => {
  let calls = 0;
  const f = await api({generate: async () => {calls++; throw new Error('synthetic offline');}});
  expect((await f.post(`${f.base}/guided/feedback`, action(f.attempt))).statusCode).toBe(400);
  const independent = (await f.post('/independent', {clientRequestId: randomUUID()})).json<Attempt>();
  expect((await f.post(`/attempts/${independent.id}/guided/feedback`, action(independent))).statusCode).toBe(403);
  let attempt = (await f.post(f.base, {text: 'A'.repeat(1801), ...action(f.attempt)}, 'PATCH')).json<Attempt>();
  const large = await f.post(`${f.base}/guided/feedback`, action(attempt));
  expect(large.statusCode).toBe(400);
  expect(large.json().error.code).toBe('feedback_input_too_long');
  expect(calls).toBe(0);
  attempt = (await f.post(f.base, {text: 'Kamień jest chłodny.', ...action(attempt)}, 'PATCH')).json<Attempt>();
  expect((await f.post(`${f.base}/guided/feedback`, action(attempt))).statusCode).toBeGreaterThanOrEqual(500);
  const current = (await f.get(f.base)).json<AttemptDetail>();
  expect(current.attempt).toEqual(attempt);
  expect(current.assistanceEvents).toHaveLength(0);
  expect((await f.post(f.base, {text: 'Kamień jest chłodny, choć leży w słońcu.', ...action(attempt)}, 'PATCH')).statusCode).toBe(200);
});
