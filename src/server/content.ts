import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ContentCardSchema, publicCard } from "../domain/cards.js";
import { MethodSchema } from "../shared/schemas.js";
import { projectRoot } from "./paths.js";
const content = z
  .array(ContentCardSchema)
  .min(3)
  .parse(
    JSON.parse(
      readFileSync(path.join(projectRoot, "content/pl/e1.json"), "utf8"),
    ),
  );
if (new Set(content.map((c) => c.id)).size !== content.length)
  throw new Error("Powtórzony identyfikator karty.");
export const cards = content
  .filter((c) => c.partition === "training")
  .map(publicCard);
export const getCard = (id: string) => content.find((c) => c.id === id);

export const methods = z.array(MethodSchema).parse(JSON.parse(readFileSync(path.join(projectRoot, 'content/pl/methods.json'), 'utf8')));
export const getMethod = (id: string, version = 1) => methods.find(m => m.id === id && m.version === version);
