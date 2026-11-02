import { z } from "zod";
import { FamilySchema, PromptSchema, SetRoleSchema } from "../shared/schemas.js";
export const CardSchema = z
  .object({
    id: z.string().min(1).max(100),
    version: z.number().int().positive(),
    family: FamilySchema,
    partition: z.enum(["training", "reserve"]),
    prompt: PromptSchema,
    constraints: z.array(z.string().max(500)).max(10),
    methodId: z.string().min(1).max(80), methodVersion: z.number().int().positive().default(1),
    language: z.literal('pl'), responseMode: z.enum(['open_writing','closed_naming','comprehension']),
    itemFamilyId: z.string().min(1).max(150), setRole: SetRoleSchema,
    difficultyTags: z.array(z.string().max(80)).max(10), contentOrigin: z.string().max(500),
    licenseStatus: z.string().max(500), editorialStatus: z.literal('reviewed'),
    easierInstruction: z.string().min(1).max(4000), optionalConstraint: z.string().max(500).nullable().default(null),
  })
  .strict();
export const ContentCardSchema = CardSchema.extend({
  hints: z.tuple([
    z.string().min(1).max(4000),
    z.string().min(1).max(4000),
    z.string().min(1).max(4000),
  ]),
});
export type Card = z.infer<typeof CardSchema>;
export type ContentCard = z.infer<typeof ContentCardSchema>;
export function publicCard(card: ContentCard): Card {
  return CardSchema.strip().parse(card);
}
