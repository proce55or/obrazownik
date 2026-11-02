import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import cookie from '@fastify/cookie';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { HOST, PORT, VERSION } from '../shared/config.js';
import { projectRoot, resolveDataDir } from './paths.js';

export interface AppOptions { dataDir?: string; serveClient?: boolean }
export async function createApp(options: AppOptions = {}) {
  const dataDir = resolveDataDir(options.dataDir ?? process.env.OBRAZOWNIK_DATA_DIR);
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024, trustProxy: false });
  await app.register(cookie);
  const sessions = new Map<string, { token: string; expires: number }>();
  const origins = new Set([`http://${HOST}:${PORT}`, 'http://127.0.0.1:5173']);
  const hosts = new Set([`${HOST}:${PORT}`, '127.0.0.1:5173']);
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (!hosts.has(req.headers.host ?? '') || (req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') {
      return reply.code(403).send({ code: 'FORBIDDEN', message: 'Żądanie spoza lokalnej aplikacji.' });
    }
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const session = sessions.get(req.cookies.obrazownik ?? '');
      const token = req.headers['x-csrf-token'];
      if (!req.headers.origin || !session || session.expires < Date.now() || typeof token !== 'string' || token.length !== session.token.length || !timingSafeEqual(Buffer.from(token), Buffer.from(session.token))) {
        return reply.code(403).send({ code: 'CSRF', message: 'Odśwież połączenie z aplikacją i spróbuj ponownie.' });
      }
      if (!req.headers['content-type']?.startsWith('application/json')) {
        return reply.code(415).send({ code: 'CONTENT_TYPE', message: 'Wymagane dane JSON.' });
      }
    }
  });
  app.get('/api/health', async () => ({ app: 'obrazownik', version: VERSION, status: 'ok' }));
  app.get('/api/bootstrap', async (req, reply) => {
    const now = Date.now();
    for (const [key, value] of sessions) if (value.expires < now) sessions.delete(key);
    let sid = req.cookies.obrazownik;
    let session = sid ? sessions.get(sid) : undefined;
    if (!session) {
      if (sessions.size >= 256) sessions.delete(sessions.keys().next().value!);
      sid = randomBytes(32).toString('hex');
      session = { token: randomBytes(32).toString('hex'), expires: now + 24 * 60 * 60 * 1000 };
      sessions.set(sid, session);
      reply.setCookie('obrazownik', sid, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 86400 });
    }
    return { version: VERSION, csrfToken: session.token, dataDir };
  });
  if (options.serveClient !== false && existsSync(path.join(projectRoot, 'dist/client/index.html'))) {
    await app.register(staticFiles, { root: path.join(projectRoot, 'dist/client'), index: 'index.html' });
  }
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ code: 'NOT_FOUND', message: 'Nie znaleziono strony.' }));
  app.setErrorHandler((error, _req, reply) => {
    const status = (error as { statusCode?: number }).statusCode;
    reply.code(status && status >= 400 && status < 500 ? status : 500).send({ code: 'REQUEST_FAILED', message: 'Nie udało się wykonać operacji. Twój tekst pozostaje w edytorze.' });
  });
  return app;
}
