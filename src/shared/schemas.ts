import { z } from "zod";
export const FamilySchema = z.enum([
  "property",
  "bridge",
  "verb",
  "sense",
  "transform",
]);
export const AssistanceStateSchema = z.enum(['none_confirmed', 'assisted', 'unknown']);
export const SetRoleSchema = z.enum(['training', 'near_transfer', 'independent_writing']);
export const MethodSchema = z.object({
  id: z.string().min(1).max(80), version: z.number().int().positive(), language: z.literal('pl'), title: z.string().max(200),
  sourceRefs: z.array(z.string().regex(/^R\d{2}$/)).max(22), sourceLinks: z.array(z.object({ label: z.string().max(200), url: z.url().startsWith('https://') })).max(10),
  basisType: z.enum(['clinical_adaptation','experimental_inspiration','linguistic_resource','creative_hypothesis']),
  adaptationNote: z.string().max(2000), validationStatus: z.literal('unvalidated_polish_app_adaptation'), contentOrigin: z.string().max(500), licenseStatus: z.string().max(500),
  slots: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]+$/), label: z.string().max(200) })).max(12),
}).strict();
export type Method = z.infer<typeof MethodSchema>;
export const PromptSchema = z
  .object({
    title: z.string().max(200),
    stimulus: z.string().max(1000),
    instruction: z.string().max(4000),
  })
  .strict();
export const RatingsSchema = z
  .object({
    ease: z.number().int().min(1).max(5).optional(),
    voice: z.number().int().min(1).max(5).optional(),
    fatigue: z.number().int().min(1).max(5).optional(),
    note: z.string().max(2000).optional(),
    intention: z.number().int().min(1).max(5).optional(),
  })
  .strict();
export const SettingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("pl", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    fontSize: z.union([z.enum(['normal','large']),z.number().int().min(16).max(26)]),
    optionalMethods: z.array(z.enum(['M2','M3','M5'])).default([]),
    repeatEnabled: z.boolean(),
    repeatOffsetsDays: z.array(z.number().int().min(1).max(365)).min(1).max(6).refine(days=>new Set(days).size===days.length),
  })
  .strict();
export const ScaffoldingSchema=z.record(z.string().max(80),z.string().max(4000)).refine(fields=>Object.keys(fields).length<=12,{message:'Maksymalnie 12 pól pomocniczych.'});
export const AttemptSchema = z
  .object({
    id: z.uuid(),
    sessionId: z.uuid().nullable(),
    cardId: z.string().max(100),
    cardVersion: z.number().int().positive(),
    promptSnapshot: PromptSchema,
    family: FamilySchema,
    partition: z.enum(["training", "reserve"]),
    mode: z.enum(["training", "independent", "repeat"]),
    status: z.enum(["draft", "completed", "skipped", "abandoned"]),
    revision: z.number().int().nonnegative(),
    currentText: z.string().max(50_000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    sourceAttemptId: z.uuid().nullable(),
    constraints: z.array(z.string().max(500)).max(10),
    selfRatings: RatingsSchema.nullable(),
    assistanceTracking: z.enum(['known','unknown']).default('unknown'),
    exposureTracking: z.enum(['known','unknown']).default('unknown'),
    methodId: z.string().max(80).default('legacy-unmapped'),
    methodVersion: z.number().int().positive().default(1),
    methodSnapshot: MethodSchema.nullable().default(null),
    itemFamilyId: z.string().max(150).default('legacy-unknown'),
    setRole: SetRoleSchema.default('training'),
    responseMode: z.enum(['open_writing','closed_naming','comprehension']).default('open_writing'),
    noveltyStatus: z.enum(['new_confirmed','seen','unknown']).default('unknown'),
    scaffolding: ScaffoldingSchema.default({}),
    sourceText: z.string().max(50000).nullable().default(null),
    sourceDocumentId:z.uuid().nullable().default(null),
    scaffoldSlots:z.array(z.object({id:z.string().regex(/^[a-z0-9_-]+$/),label:z.string().max(200)})).max(12).default([]),
  })
  .strict();
export const VersionSchema = z
  .object({
    id: z.uuid(),
    attemptId: z.uuid(),
    text: z.string().max(50_000),
    createdAt: z.iso.datetime(),
    reason: z.enum(["pre_hint", "final", "manual", "recovery"]),
    assistanceLevelAtCapture: z.number().int().min(0).max(3),
    assistanceStateAtCapture: AssistanceStateSchema.default('unknown'),
    scaffolding: ScaffoldingSchema.default({}),
  })
  .strict();
export const AssistanceSchema = z
  .object({
    id: z.uuid(),
    attemptId: z.uuid(),
    level: z.number().int().min(1).max(3),
    kind: z.enum(["question", "direction", "example", "word_bank"]),
    revealedContentSnapshot: z.string().max(4000),
    requestedAt: z.iso.datetime(),
    deliveredAt: z.iso.datetime().nullable(),
    status: z.enum(["prepared", "delivered", "failed"]),
  })
  .strict();
export const CreateAttemptSchema = z
  .object({ cardId: z.string().min(1).max(100), clientRequestId: z.uuid(),variant:z.enum(['standard','easy']).default('standard'),useConstraint:z.boolean().default(false) })
  .strict();
export const SaveAttemptSchema = z
  .object({
    text: z.string().max(50_000),
    expectedRevision: z.number().int().nonnegative(),
    clientMutationId: z.uuid(),
    scaffolding: ScaffoldingSchema.optional(),
  })
  .strict();
export const ActionSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    clientMutationId: z.uuid(),
  })
  .strict();
export const HintRequestSchema = ActionSchema.extend({
  level: z.number().int().min(1).max(3),
});
export const CompleteSchema = ActionSchema.extend({
  selfRatings: RatingsSchema.optional(),
});
export const DetailSchema = z.object({
  attempt: AttemptSchema,
  versions: z.array(VersionSchema),
  assistanceEvents: z.array(AssistanceSchema),
  assistanceState: AssistanceStateSchema.optional(),
});
export const BootstrapSchema = z.object({
  version: z.string(),
  csrfToken: z.string(),
  dataDir: z.string(),
  environmentId: z.uuid(),
  settings: SettingsSchema,
  drafts: z.array(AttemptSchema),
});
export type Attempt = z.infer<typeof AttemptSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type AttemptVersion = z.infer<typeof VersionSchema>;
export type AssistanceEvent = z.infer<typeof AssistanceSchema>;
export type AttemptDetail = z.infer<typeof DetailSchema>;
export type Bootstrap = z.infer<typeof BootstrapSchema>;
export type SaveAttempt = z.infer<typeof SaveAttemptSchema>;
export type Ratings = z.infer<typeof RatingsSchema>;
