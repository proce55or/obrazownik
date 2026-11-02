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
