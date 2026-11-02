import { z } from "zod";
import { FamilySchema, PromptSchema } from "../shared/schemas.js";
export const CardSchema = z
  .object({
    id: z.string().min(1).max(100),
    version: z.number().int().positive(),
    family: FamilySchema,
    partition: z.enum(["training", "reserve"]),
    prompt: PromptSchema,
    constraints: z.array(z.string().max(500)).max(10),
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
