import { z } from 'zod';

export const LocalLlmProvenanceSchema = z.object({
  modelId: z.string().max(200),
  modelSha256: z.string().regex(/^[a-f0-9]{64}$/),
  promptVersion: z.string().max(80),
  generatedAt: z.iso.datetime(),
  generationMs: z.number().nonnegative(),
  cacheHit: z.boolean(),
}).strict();
export type LocalLlmProvenance = z.infer<typeof LocalLlmProvenanceSchema>;
