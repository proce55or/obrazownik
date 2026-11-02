import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ContentCardSchema, publicCard } from "../domain/cards.js";
import { MethodSchema } from "../shared/schemas.js";
import { projectRoot } from "./paths.js";
const content=z.array(ContentCardSchema).min(3).parse(['e1.json','science-training.json','independent.json','more-training.json'].flatMap(file=>JSON.parse(readFileSync(path.join(projectRoot,'content/pl',file),'utf8'))));
if (new Set(content.map((c) => `${c.id}:${c.version}`)).size !== content.length)
  throw new Error("Powtórzony identyfikator karty.");
export const cards = content
  .filter(c=>!content.some(other=>other.id===c.id&&other.version>c.version))
  .filter((c) => c.partition === "training" && c.setRole === "training")
  .map(publicCard);
export const getCard = (id: string, version?:number) => [...content].sort((a,b)=>b.version-a.version).find((c) => c.id === id && (!version || c.version===version));
export const allCards=content;

export const methods = z.array(MethodSchema).parse(JSON.parse(readFileSync(path.join(projectRoot, 'content/pl/methods.json'), 'utf8')));
export const getMethod = (id: string, version = 1) => methods.find(m => m.id === id && m.version === version);

for(const card of content)if(!getMethod(card.methodId,card.methodVersion))throw new Error('Nieznana metoda karty.');

const rolesByFamily=new Map<string,Set<string>>();for(const card of content){const roles=rolesByFamily.get(card.itemFamilyId)??new Set<string>();roles.add(card.setRole);rolesByFamily.set(card.itemFamilyId,roles);}
for(const roles of rolesByFamily.values())if(roles.has('independent_writing')&&roles.size>1)throw new Error('Parafraza chronionego tematu trafiła do innego zbioru.');
