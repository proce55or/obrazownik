import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/server/app.js';
const directories: string[] = [];
const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
async function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'obrazownik-api-'));
  directories.push(dataDir);
  const app = await createApp({ dataDir, serveClient: false });
  apps.push(app);
  return app;
}
const headers = { host: '127.0.0.1:4317' };
test('health, bootstrap and loopback listener are real', async () => {
  const app = await setup();
  expect((await app.inject({ url: '/api/health', headers })).json()).toMatchObject({ app: 'obrazownik', status: 'ok', version: '0.1.0' });
  const bootstrap = await app.inject({ url: '/api/bootstrap', headers });
  expect(bootstrap.json().csrfToken).toMatch(/^[a-f0-9]{64}$/);
  expect(bootstrap.headers['set-cookie']).toContain('HttpOnly');
  await app.listen({ port: 0, host: '127.0.0.1' });
  expect(app.server.address()).toMatchObject({ address: '127.0.0.1' });
});
test('rejects foreign Host, Origin, fetch-site and unauthenticated mutations', async () => {
  const app = await setup();
  for (const unsafe of [{ host: 'evil.example' }, { ...headers, origin: 'https://evil.example' }, { ...headers, 'sec-fetch-site': 'cross-site' }]) {
    expect((await app.inject({ url: '/api/bootstrap', headers: unsafe })).statusCode).toBe(403);
  }
  expect((await app.inject({ method: 'POST', url: '/api/anything', headers: { ...headers, origin: 'http://127.0.0.1:4317' }, payload: {} })).statusCode).toBe(403);
});

test('API validates writes, preserves CAS and rejects invalid token, content type and origin', async () => {
  const app = await setup();
  const boot = await app.inject({ url: '/api/bootstrap', headers });
  const auth = { ...headers, origin: 'http://127.0.0.1:4317', cookie: boot.cookies.map(c => `${c.name}=${c.value}`).join('; '), 'x-csrf-token': boot.json().csrfToken };
  const { randomUUID } = await import('node:crypto');
  const created = await app.inject({ method: 'POST', url: '/api/attempts', headers: auth, payload: { cardId: 'property-stone-01', clientRequestId: randomUUID() } });
  expect(created.statusCode).toBe(200);
  const id = created.json().id;
  const patch = { text: 'Kamień\nłapie ciepło.', expectedRevision: 0, clientMutationId: randomUUID() };
  for (const bad of [{ ...auth, origin: 'https://foreign.test' }, { ...auth, 'x-csrf-token': 'ą'.repeat(64) }, { ...auth, 'x-csrf-token': '' }]) {
    expect((await app.inject({ method: 'PATCH', url: `/api/attempts/${id}`, headers: bad, payload: patch })).statusCode).toBe(403);
  }
  expect((await app.inject({ method: 'PATCH', url: `/api/attempts/${id}`, headers: { ...auth, 'content-type': 'text/plain' }, payload: 'bad' })).statusCode).toBe(415);
  expect((await app.inject({ method: 'PATCH', url: `/api/attempts/${id}`, headers: auth, payload: { ...patch, text: 'x'.repeat(50_001) } })).statusCode).toBe(400);
  const accepted = await app.inject({ method: 'PATCH', url: `/api/attempts/${id}`, headers: auth, payload: patch });
  expect(accepted.json()).toMatchObject({ currentText: patch.text, revision: 1 });
  expect((await app.inject({ method: 'PATCH', url: `/api/attempts/${id}`, headers: auth, payload: patch })).json()).toEqual(accepted.json());
  const conflict = await app.inject({ method: 'PATCH', url: `/api/attempts/${id}`, headers: auth, payload: { ...patch, clientMutationId: randomUUID(), text: 'Druga karta' } });
  expect(conflict.statusCode).toBe(409);
  expect(conflict.json()).toEqual({ error: { code: 'revision_conflict', message: expect.any(String), retryable: false, currentRevision: 1 } });
  expect((await app.inject({ url: `/api/attempts/${id}`, headers })).json().attempt.currentText).toBe(patch.text);
  expect((await app.inject({ url: '/api/attempts?limit=101', headers })).statusCode).toBe(400);
});
