import Fastify from "fastify";
import staticFiles from "@fastify/static";
import cookie from "@fastify/cookie";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Socket } from 'node:net';
import { existsSync } from "node:fs";
import path from "node:path";
import { HOST, PORT, VERSION } from "../shared/config.js";
import { projectRoot, resolveDataDir } from "./paths.js";
import { Storage } from "./storage.js";
import { AppError } from "./errors.js";
import { z, ZodError } from "zod";
import {
  ActionSchema,
  CreateAttemptSchema,
  HintRequestSchema,
  RatingsSchema,
  SaveAttemptSchema,
  SettingsSchema,
} from "../shared/schemas.js";
import { cards, getCard } from "./content.js";

export interface AppOptions {
  dataDir?: string;
  serveClient?: boolean;
  clientRoot?: string;
}
export async function createApp(options: AppOptions = {}) {
  const dataDir = resolveDataDir(
    options.dataDir ?? process.env.OBRAZOWNIK_DATA_DIR,
  );
  const app = Fastify({
    logger: false,
    forceCloseConnections: 'idle',
    bodyLimit: 128 * 1024,
    trustProxy: false,
  });
  // Browsers may preconnect without sending HTTP headers. Node does not count
  // those sockets as idle HTTP connections; close only those unused sockets.
  const unusedSockets = new Set<Socket>();
  app.server.on('connection', socket => {
    unusedSockets.add(socket);
    socket.once('close', () => unusedSockets.delete(socket));
  });
  app.server.on('request', request => unusedSockets.delete(request.socket));
  app.addHook('preClose', async () => {
    for (const socket of unusedSockets) socket.destroy();
  });
  // Install before awaiting plugins: production routes must share the API error contract.
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({
      error: {
        code: "not_found",
        message: "Nie znaleziono strony.",
        retryable: false,
      },
    }),
  );
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: "validation",
          message:
            "Sprawdź dane i limit 50 000 znaków. Twój tekst pozostaje w edytorze.",
          retryable: false,
        },
      });
    if (error instanceof AppError)
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          ...(error.currentRevision !== undefined
            ? { currentRevision: error.currentRevision }
            : {}),
        },
      });
    const status = (error as { statusCode?: number }).statusCode;
    reply.code(status && status >= 400 && status < 500 ? status : 500).send({
      error: {
        code: "request_failed",
        message:
          "Nie udało się wykonać operacji. Twój tekst pozostaje w edytorze.",
        retryable: true,
      },
    });
  });
  await app.register(cookie);
  const storage = await Storage.open(dataDir);
  app.addHook("onClose", async () => storage.close());
  const sessions = new Map<string, { token: string; expires: number }>();
  const origins = new Set([`http://${HOST}:${PORT}`, "http://127.0.0.1:5173"]);
  const hosts = new Set([`${HOST}:${PORT}`, "127.0.0.1:5173"]);
  app.addHook("onRequest", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (
      !hosts.has(req.headers.host ?? "") ||
      (req.headers.origin && !origins.has(req.headers.origin)) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      throw new AppError(403, "forbidden", "Żądanie spoza lokalnej aplikacji.");
    }
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const session = sessions.get(req.cookies.obrazownik ?? "");
      const token = req.headers["x-csrf-token"];
      if (
        !req.headers.origin ||
        !session ||
        session.expires < Date.now() ||
        typeof token !== "string" ||
        Buffer.byteLength(token) !== Buffer.byteLength(session.token) ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(session.token))
      ) {
        throw new AppError(
          403,
          "csrf",
          "Odśwież połączenie z aplikacją i spróbuj ponownie.",
        );
      }
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        throw new AppError(415, "content_type", "Wymagane dane JSON.");
      }
    }
  });
  app.get("/api/health", async () => ({
    app: "obrazownik",
    version: VERSION,
    schemaVersion: 2,
    status: "ok",
  }));
  app.get("/api/bootstrap", async (req, reply) => {
    const now = Date.now();
    for (const [key, value] of sessions)
      if (value.expires < now) sessions.delete(key);
    let sid = req.cookies.obrazownik;
    let session = sid ? sessions.get(sid) : undefined;
    if (!session) {
      if (sessions.size >= 256) sessions.delete(sessions.keys().next().value!);
      sid = randomBytes(32).toString("hex");
      session = {
        token: randomBytes(32).toString("hex"),
        expires: now + 24 * 60 * 60 * 1000,
      };
      sessions.set(sid, session);
      reply.setCookie("obrazownik", sid, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 86400,
      });
    }
    return {
      version: VERSION,
      csrfToken: session.token,
      dataDir,
      environmentId: storage.environmentId,
      settings: storage.settings(),
      drafts: storage.listAttempts(100, 0, "draft"),
    };
  });
  const idOf = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;
  app.get("/api/cards", async () => { storage.previewCards(cards); return { cards }; });
  app.patch("/api/settings", async (req) =>
    storage.updateSettings(SettingsSchema.parse(req.body)),
  );
  app.post("/api/attempts", async (req) => {
    const input = CreateAttemptSchema.parse(req.body);
    const card = getCard(input.cardId);
    if (!card || card.partition !== "training")
      throw new AppError(
        404,
        "card_not_found",
        "Nie znaleziono karty ćwiczenia.",
      );
    return storage.createAttempt(card, input.clientRequestId);
  });
  app.get("/api/attempts", async (req) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        offset: z.coerce.number().int().nonnegative().default(0),
        status: z
          .enum(["draft", "completed", "skipped", "abandoned"])
          .optional(),
      })
      .strict()
      .parse(req.query);
    return {
      attempts: storage.listAttempts(query.limit, query.offset, query.status),
    };
  });
  app.get("/api/attempts/:id", async (req) => storage.detail(idOf(req.params)));
  app.patch("/api/attempts/:id", async (req) =>
    storage.saveAttempt(idOf(req.params), SaveAttemptSchema.parse(req.body)),
  );
  app.post("/api/attempts/:id/shown", async (req) =>
    storage.shown(idOf(req.params)),
  );
  app.post("/api/attempts/:id/hints", async (req) => {
    const id = idOf(req.params),
      input = HintRequestSchema.parse(req.body);
    const replay=storage.replayMutation(`hint:${id}`,input.clientMutationId,input);if(replay!==undefined)return replay;
    const attempt = storage.getAttempt(id),
      card = getCard(attempt.cardId);
    if (!card || card.version !== attempt.cardVersion)
      throw new AppError(
        409,
        "card_version",
        "Ta wersja karty nie jest już dostępna. Możesz nadal zapisać tekst.",
      );
    return storage.prepareHint(id, input, card.hints[input.level - 1]);
  });
  app.post("/api/attempts/:id/hints/:eventId/delivered", async (req) => {
    const params = z
      .object({ id: z.uuid(), eventId: z.uuid() })
      .parse(req.params);
    return storage.deliverHint(params.id, params.eventId);
  });
  app.post("/api/attempts/:id/complete", async (req) =>
    storage.finish(idOf(req.params), ActionSchema.parse(req.body), "completed"),
  );
  app.post("/api/attempts/:id/skip", async (req) =>
    storage.finish(idOf(req.params), ActionSchema.parse(req.body), "skipped"),
  );
  app.post("/api/attempts/:id/ratings", async (req) =>
    storage.rate(
      idOf(req.params),
      ActionSchema.extend({ selfRatings: RatingsSchema }).parse(req.body),
    ),
  );
  app.post("/api/attempts/:id/recovery", async (req) =>
    storage.recover(
      idOf(req.params),
      z
        .object({ text: z.string().max(50_000), clientMutationId: z.uuid() })
        .strict()
        .parse(req.body),
    ),
  );

  app.post('/api/backup', async () => ({filename:await storage.backup()}));
  app.get('/api/export', async (_req,reply) => {reply.header('Content-Disposition','attachment; filename="obrazownik.json"');return storage.exportData();});
  app.post('/api/import/preview',{bodyLimit:25*1024*1024},async req=>storage.previewImport(req.body));
  app.post('/api/import/confirm',{bodyLimit:25*1024*1024},async req=>{const input=z.object({bundle:z.unknown(),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);return storage.importData(input.bundle,input.digest);});
  const clientRoot =
    options.clientRoot ?? path.join(projectRoot, "dist/client");
  if (
    options.serveClient !== false &&
    existsSync(path.join(clientRoot, "index.html"))
  ) {
    await app.register(staticFiles, {
      root: clientRoot,
      index: "index.html",
    });
  }
  return app;
}
