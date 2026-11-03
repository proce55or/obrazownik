import Fastify from "fastify";
import staticFiles from "@fastify/static";
import cookie from "@fastify/cookie";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Socket } from 'node:net';
import { existsSync } from "node:fs";
import path from "node:path";
import { HOST, PORT, VERSION } from "../shared/config.js";
import { projectRoot, resolveDataDir } from "./paths.js";
import { NotebookQuerySchema,DocumentListQuerySchema,CreateDocumentSchema,SaveDocumentSchema,DocumentVersionRequestSchema } from "./notebook.js";
import { Storage } from "./storage.js";
import { AppError } from "./errors.js";
import { z, ZodError } from "zod";
import {
  ActionSchema,
  FamilySchema,
  ScaffoldingSchema,
  CreateAttemptSchema,
  HintRequestSchema,
  RatingsSchema,
  SaveAttemptSchema,
  SettingsSchema,
} from "../shared/schemas.js";
import { cards, getCard, allCards } from "./content.js";
import { GuidedStartSchema } from '../shared/guided.js';
import { GuidedFeedbackService, type GuidedFeedbackOptions } from './guided-feedback.js';
import type { AttemptDetail } from '../shared/schemas.js';
import { LocalHintService, assertLlmAttempt, type LocalLlmOptions } from './local-llm.js';

export interface AppOptions {
  dataDir?: string;
  localPort?:number;
  serveClient?: boolean;
  clientRoot?: string;
  llm?: LocalLlmOptions;
  guidedLlm?: GuidedFeedbackOptions;
}
export async function createApp(options: AppOptions = {}) {
  const localPort=z.number().int().min(1024).max(65535).parse(options.localPort??PORT);
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
  const llm = new LocalHintService(dataDir,options.llm);
  const guidedLlm = new GuidedFeedbackService(options.guidedLlm);
  const guidedJobs = new Map<string, {mutationId: string; revision: number; promise: Promise<AttemptDetail>}>();
  app.addHook("onClose", async () => {await Promise.all([llm.close(), guidedLlm.close()]);await storage.close();});
  const sessions = new Map<string, { token: string; expires: number }>();
  const origins = new Set([`http://${HOST}:${localPort}`, "http://127.0.0.1:5173"]);
  const hosts = new Set([`${HOST}:${localPort}`, "127.0.0.1:5173"]);
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
    schemaVersion: 4,
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
      drafts: storage.listAttempts(3, 0, "draft"),
    };
  });
  const idOf = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;
  app.get('/api/cards',async req=>{const query=z.object({family:FamilySchema.optional()}).strict().parse(req.query),enabled=storage.settings().optionalMethods;const visible=cards.filter(c=>(!query.family||c.family===query.family)&&(!['M2','M3','M5'].includes(c.methodId)||enabled.includes(c.methodId as 'M2'|'M3'|'M5')));storage.previewCards(visible);return{cards:visible};});
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
    if(['M2','M3','M5'].includes(card.methodId)&&!storage.settings().optionalMethods.includes(card.methodId as 'M2'|'M3'|'M5'))throw new AppError(409,'method_disabled','Włącz ten opcjonalny wariant w ustawieniach.');
    return storage.createAttempt(card, input.clientRequestId,input);
  });
  app.post('/api/guided/start', async req => storage.createGuided(GuidedStartSchema.parse(req.body).clientRequestId));
  app.post('/api/attempts/:id/guided/feedback', async req => {
    const id = idOf(req.params), input = ActionSchema.parse(req.body);
    const replay = storage.replayMutation(`guided-feedback:${id}`, input.clientMutationId, input);
    if (replay !== undefined) return replay;
    const attempt = storage.checkGuided(id, input.expectedRevision);
    if (!attempt.currentText.trim())
      throw new AppError(400, 'guided_empty_answer', 'Napisz własną odpowiedź, zanim poprosisz Bielika o jej przeczytanie.');
    if (attempt.currentText.length > 1800)
      throw new AppError(400, 'feedback_input_too_long', 'Bielik może przeczytać do 1800 znaków w jednym etapie. Twój cały tekst jest zapisany. Skróć odpowiedź przed poproszeniem o informację zwrotną.');
    const pending = guidedJobs.get(id);
    if (pending) {
      if (pending.mutationId === input.clientMutationId && pending.revision === input.expectedRevision) return pending.promise;
      throw new AppError(409, 'guided_busy', 'Bielik jeszcze czyta tę odpowiedź. Poczekaj na wynik.', true);
    }
    const promise = guidedLlm.generate(attempt).then(result =>
      storage.prepareGuidedFeedback(id, input, attempt.currentText, result));
    guidedJobs.set(id, {mutationId: input.clientMutationId, revision: input.expectedRevision, promise});
    try { return await promise; }
    finally { if (guidedJobs.get(id)?.promise === promise) guidedJobs.delete(id); }
  });
  app.post('/api/attempts/:id/guided/next', async req => storage.nextGuided(idOf(req.params), ActionSchema.parse(req.body)));
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
      card = getCard(attempt.cardId,attempt.cardVersion);
    const archived=!card?storage.lookupCard(attempt.cardId,attempt.cardVersion):undefined;
    if ((!card&&!archived) || (card&&card.version !== attempt.cardVersion))
      throw new AppError(
        409,
        "card_version",
        "Ta wersja karty nie jest już dostępna. Możesz nadal zapisać tekst.",
      );
    if(!card&&input.level===3)throw new AppError(409,'archive_example_unavailable','Ta archiwalna karta nie udostępnia przykładu. Twój tekst pozostaje zapisany.');
    return storage.prepareHint(id, input, !card?['Który szczegół chcesz zachować?','Zostań przy jednym zdarzeniu i jednym własnym zdaniu.'][input.level-1]:card.setRole==='independent_writing' ? ['Który szczegół tej sytuacji chcesz zachować?', 'Możesz zostać przy jednym zdarzeniu i jednym własnym zdaniu.', 'Zostań przy swoich słowach — ta wersja nie podaje gotowego rozwiązania.'][input.level-1] : card.hints[input.level - 1]);
  });
  app.post("/api/attempts/:id/hints/:eventId/delivered", async (req) => {
    const params = z
      .object({ id: z.uuid(), eventId: z.uuid() })
      .parse(req.params);
    return storage.deliverHint(params.id, params.eventId);
  });
  app.get('/api/llm/status',async()=>llm.runtimeStatus(storage.settings().llmMode==='bielik'));
  app.get('/api/attempts/:id/llm/status',async req=>({...llm.status(storage.getAttempt(idOf(req.params))),prefetchEnabled:storage.settings().llmPrefetch}));
  app.post('/api/attempts/:id/llm/prefetch',async req=>{
    z.object({}).strict().parse(req.body);
    return llm.prefetch(storage.getAttempt(idOf(req.params)));
  });
  app.post('/api/attempts/:id/llm/hint',async req=>{
    const id=idOf(req.params),input=ActionSchema.parse(req.body);
    const replay=storage.replayMutation(`llm-hint:${id}`,input.clientMutationId,input);
    if(replay)return replay;
    const attempt=storage.checkRevision(id,input.expectedRevision);
    assertLlmAttempt(attempt);
    const prior=storage.assistance(id).find(event=>event.provider==='bielik_local'&&event.status!=='failed');
    if(prior?.llm)return storage.prepareLlmHint(id,input,prior.revealedContentSnapshot,prior.llm);
    const question=llm.ready(attempt);
    return storage.prepareLlmHint(id,input,question.content,question.llm);
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
        .object({ text: z.string().max(50_000), clientMutationId: z.uuid(),scaffolding:ScaffoldingSchema.optional() })
        .strict()
        .parse(req.body),
    ),
  );

  app.post('/api/backup', async () => ({filename:await storage.backup()}));
  app.get('/api/export', async (_req,reply) => {reply.header('Content-Disposition','attachment; filename="obrazownik.json"');return storage.exportData();});
  app.post('/api/import/preview',{bodyLimit:25*1024*1024},async req=>storage.previewImport(req.body));
  app.post('/api/import/confirm',{bodyLimit:25*1024*1024+4096},async req=>{const input=z.object({bundle:z.unknown(),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);return storage.importData(input.bundle,input.digest);});

  app.get('/api/independent/status',async()=>storage.independentStatus(allCards));
  app.post('/api/independent',async req=>{const input=z.object({clientRequestId:z.uuid(),role:z.enum(['independent_writing','near_transfer']).default('independent_writing')}).strict().parse(req.body);return storage.createIndependent(allCards,input.clientRequestId,input.role);});
  app.post('/api/attempts/:id/assisted',async req=>storage.assistedCopy(idOf(req.params),ActionSchema.parse(req.body)));

  app.get('/api/sessions/active',async()=>({session:storage.activeSession()}));
  app.post('/api/sessions',async req=>{const input=z.object({clientRequestId:z.uuid(),energy:z.enum(['low','medium','high']).optional(),family:FamilySchema.optional()}).strict().parse(req.body);const enabled=storage.settings().optionalMethods;return storage.createSession(cards.filter(c=>!['M2','M3','M5'].includes(c.methodId)||enabled.includes(c.methodId as 'M2'|'M3'|'M5')),input);});
  app.get('/api/sessions/:id',async req=>storage.getSession(idOf(req.params)));
  app.patch('/api/sessions/:id',async req=>storage.endSession(idOf(req.params),z.object({clientMutationId:z.uuid(),status:z.enum(['completed','abandoned'])}).strict().parse(req.body)));
  app.get('/api/reviews',async()=>({reviews:storage.reviews()}));
  app.get('/api/backups',async()=>({backups:storage.backupList()}));

  app.get('/api/notebook',async req=>storage.notebookAttempts(NotebookQuerySchema.parse(req.query)));
  app.get('/api/documents',async req=>storage.listDocuments(DocumentListQuerySchema.parse(req.query)));
  app.post('/api/documents',async req=>storage.createDocument(CreateDocumentSchema.parse(req.body)));
  app.get('/api/documents/:id',async req=>storage.documentDetail(idOf(req.params)));
  app.patch('/api/documents/:id',async req=>storage.saveDocument(idOf(req.params),SaveDocumentSchema.parse(req.body)));
  app.post('/api/documents/:id/versions',async req=>storage.documentVersion(idOf(req.params),DocumentVersionRequestSchema.parse(req.body)));
  app.get('/api/documents/:id/markdown',async(req,reply)=>{reply.type('text/markdown; charset=utf-8').header('Content-Disposition','attachment; filename="moj-tekst.md"');return storage.documentMarkdown(idOf(req.params));});
  app.get('/api/attempts/:id/markdown',async(req,reply)=>{reply.type('text/markdown; charset=utf-8').header('Content-Disposition','attachment; filename="cwiczenie.md"');return storage.attemptMarkdown(idOf(req.params));});
  app.post('/api/documents/:id/transform',async req=>{const input=z.object({clientRequestId:z.uuid()}).strict().parse(req.body);return storage.transformDocument(idOf(req.params),input.clientRequestId);});
  app.get('/api/observations',async req=>{const query=DocumentListQuerySchema.omit({query:true}).parse(req.query);return storage.observations(query.limit,query.offset);});
  app.post('/api/attempts/:id/revise',async req=>{const input=z.object({clientRequestId:z.uuid()}).strict().parse(req.body);return storage.reviseAttempt(idOf(req.params),input.clientRequestId);});
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
