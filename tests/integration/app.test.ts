import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../../src/server/app.js";
const directories: string[] = [];
const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
async function setup(serveClient = false) {
  const dataDir = mkdtempSync(path.join(tmpdir(), "obrazownik-api-"));
  directories.push(dataDir);
  const clientRoot = path.join(dataDir, "synthetic-client");
  if (serveClient) {
    mkdirSync(clientRoot);
    writeFileSync(
      path.join(clientRoot, "index.html"),
      "<!doctype html><title>Test</title>",
    );
  }
  const app = await createApp({ dataDir, serveClient, clientRoot });
  apps.push(app);
  return app;
}
const headers = { host: "127.0.0.1:4317" };
test("health, bootstrap and loopback listener are real", async () => {
  const app = await setup();
  expect(
    (await app.inject({ url: "/api/health", headers })).json(),
  ).toMatchObject({ app: "obrazownik", status: "ok", version: "0.1.0" });
  const bootstrap = await app.inject({ url: "/api/bootstrap", headers });
  expect(bootstrap.json().csrfToken).toMatch(/^[a-f0-9]{64}$/);
  expect(bootstrap.headers["set-cookie"]).toContain("HttpOnly");
  await app.listen({ port: 0, host: "127.0.0.1" });
  expect(app.server.address()).toMatchObject({ address: "127.0.0.1" });
});
test("rejects foreign Host, Origin, fetch-site and unauthenticated mutations", async () => {
  const app = await setup();
  for (const unsafe of [
    { host: "evil.example" },
    { ...headers, origin: "https://evil.example" },
    { ...headers, "sec-fetch-site": "cross-site" },
  ]) {
    expect(
      (await app.inject({ url: "/api/bootstrap", headers: unsafe })).statusCode,
    ).toBe(403);
  }
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/anything",
        headers: { ...headers, origin: "http://127.0.0.1:4317" },
        payload: {},
      })
    ).statusCode,
  ).toBe(403);
});

test.each([false, true])(
  "API validates writes and conflict envelopes (static=%s)",
  async (serveClient) => {
    const app = await setup(serveClient);
    const boot = await app.inject({ url: "/api/bootstrap", headers });
    const auth = {
      ...headers,
      origin: "http://127.0.0.1:4317",
      cookie: boot.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "x-csrf-token": boot.json().csrfToken,
    };
    const { randomUUID } = await import("node:crypto");
    const created = await app.inject({
      method: "POST",
      url: "/api/attempts",
      headers: auth,
      payload: { cardId: "property-stone-01", clientRequestId: randomUUID() },
    });
    expect(created.statusCode).toBe(200);
    const id = created.json().id;
    const patch = {
      text: "Kamień\nłapie ciepło.",
      expectedRevision: 0,
      clientMutationId: randomUUID(),
    };
    for (const bad of [
      { ...auth, origin: "https://foreign.test" },
      { ...auth, "x-csrf-token": "ą".repeat(64) },
      { ...auth, "x-csrf-token": "" },
    ]) {
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/api/attempts/${id}`,
            headers: bad,
            payload: patch,
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/attempts/${id}`,
          headers: { ...auth, "content-type": "text/plain" },
          payload: "bad",
        })
      ).statusCode,
    ).toBe(415);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/attempts/${id}`,
          headers: auth,
          payload: { ...patch, text: "x".repeat(50_001) },
        })
      ).statusCode,
    ).toBe(400);
    const accepted = await app.inject({
      method: "PATCH",
      url: `/api/attempts/${id}`,
      headers: auth,
      payload: patch,
    });
    expect(accepted.json()).toMatchObject({
      currentText: patch.text,
      revision: 1,
    });
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/attempts/${id}`,
          headers: auth,
          payload: patch,
        })
      ).json(),
    ).toEqual(accepted.json());
    const conflict = await app.inject({
      method: "PATCH",
      url: `/api/attempts/${id}`,
      headers: auth,
      payload: {
        ...patch,
        clientMutationId: randomUUID(),
        text: "Druga karta",
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      error: {
        code: "revision_conflict",
        message: expect.any(String),
        retryable: false,
        currentRevision: 1,
      },
    });
    expect(
      (await app.inject({ url: `/api/attempts/${id}`, headers })).json().attempt
        .currentText,
    ).toBe(patch.text);
    expect(
      (await app.inject({ url: "/api/attempts?limit=101", headers }))
        .statusCode,
    ).toBe(400);
  },
);

test("cards hide examples; shown, help and finish cross the real API boundary", async () => {
  const app = await setup();
  const { randomUUID } = await import("node:crypto");
  const boot = await app.inject({ url: "/api/bootstrap", headers });
  const auth = {
    ...headers,
    origin: "http://127.0.0.1:4317",
    cookie: boot.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "x-csrf-token": boot.json().csrfToken,
  };
  const pack = await app.inject({ url: "/api/cards", headers });
  expect(pack.json().cards.length).toBeGreaterThanOrEqual(24);
  expect(pack.body).not.toContain("hints");
  const attempt = (
    await app.inject({
      method: "POST",
      url: "/api/attempts",
      headers: auth,
      payload: { cardId: "property-stone-01", clientRequestId: randomUUID() },
    })
  ).json();
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/attempts/${attempt.id}/shown`,
        headers: auth,
        payload: {},
      })
    ).json(),
  ).toEqual({ shown: true });
  const hint = await app.inject({
    method: "POST",
    url: `/api/attempts/${attempt.id}/hints`,
    headers: auth,
    payload: { level: 1, expectedRevision: 0, clientMutationId: randomUUID() },
  });
  expect(hint.statusCode).toBe(200);
  expect(hint.json().event.status).toBe("prepared");
  const delivered = await app.inject({
    method: "POST",
    url: `/api/attempts/${attempt.id}/hints/${hint.json().event.id}/delivered`,
    headers: auth,
    payload: {},
  });
  expect(delivered.json().status).toBe("delivered");
  const complete = await app.inject({
    method: "POST",
    url: `/api/attempts/${attempt.id}/complete`,
    headers: auth,
    payload: {
      expectedRevision: hint.json().attempt.revision,
      clientMutationId: randomUUID(),
    },
  });
  expect(complete.json().status).toBe("completed");
  const snapshot = (
    await app.inject({ url: `/api/attempts/${attempt.id}`, headers })
  ).json();
  expect(snapshot.versions.map((v: { reason: string }) => v.reason)).toEqual([
    "pre_hint",
    "final",
  ]);
});

test('shutdown closes browser preconnects without waiting for HTTP headers', async () => {
  const app = await setup();
  const { connect } = await import('node:net');
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP address');
  const socket = connect(address.port, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  const closing = app.close();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([closing, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Preconnect prevented shutdown')), 1500); })]);
  } finally { clearTimeout(timeout); socket.destroy(); await closing; }
});
