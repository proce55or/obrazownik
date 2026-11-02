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
    sourceText:z.string().max(50000).nullable().default(null),
    slots:z.array(z.object({id:z.string().regex(/^[a-z0-9_-]+$/),label:z.string().max(200)})).max(12).optional(),
    methodId: z.string().min(1).max(80), methodVersion: z.number().int().positive().default(1),
    language: z.literal('pl'), responseMode: z.enum(['open_writing','closed_naming','comprehension']),
    itemFamilyId: z.string().min(1).max(150), setRole: SetRoleSchema,
    difficultyTags: z.array(z.string().max(80)).max(10), contentOrigin: z.string().max(500),
    licenseStatus: z.string().max(500), editorialStatus: z.literal('reviewed'),
    easierInstruction: z.string().min(1).max(4000), optionalConstraint: z.string().max(500).nullable().default(null),
  })
  .strict();
export const ContentCardSchema = CardSchema.extend({ hints:z.array(z.string().min(1).max(4000)).max(3) }).superRefine((card,ctx)=>{if(card.setRole==='independent_writing'&&card.hints.length)ctx.addIssue({code:'custom',message:'Chroniona rezerwa nie zawiera pomocy'});if(card.setRole!=='independent_writing'&&card.hints.length!==3)ctx.addIssue({code:'custom',message:'Karta treningowa wymaga 3 poziomów pomocy'});});
export type Card = z.infer<typeof CardSchema>;
export type ContentCard = z.infer<typeof ContentCardSchema>;
export function publicCard(card: ContentCard): Card {
  return CardSchema.strip().parse(card);
}
