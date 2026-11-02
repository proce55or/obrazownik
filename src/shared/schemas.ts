import { z } from "zod";
export const FamilySchema = z.enum([
  "property",
  "bridge",
  "verb",
  "sense",
  "transform",
]);
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
    fontSize: z.enum(["normal", "large"]),
    repeatEnabled: z.boolean(),
    repeatOffsetsDays: z.array(z.number().int().min(1).max(365)).max(6),
  })
  .strict();
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
  })
  .strict();
export const AssistanceSchema = z
  .object({
    id: z.uuid(),
    attemptId: z.uuid(),
    level: z.number().int().min(1).max(3),
    kind: z.enum(["question", "direction", "example"]),
    revealedContentSnapshot: z.string().max(4000),
    requestedAt: z.iso.datetime(),
    deliveredAt: z.iso.datetime().nullable(),
    status: z.enum(["prepared", "delivered", "failed"]),
  })
  .strict();
export const CreateAttemptSchema = z
  .object({ cardId: z.string().min(1).max(100), clientRequestId: z.uuid() })
  .strict();
export const SaveAttemptSchema = z
  .object({
    text: z.string().max(50_000),
    expectedRevision: z.number().int().nonnegative(),
    clientMutationId: z.uuid(),
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
