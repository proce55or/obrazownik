import { z } from 'zod';
import { AttemptSchema, VersionSchema, AssistanceSchema, SettingsSchema, MethodSchema } from './schemas.js';
import { CardSchema } from '../domain/cards.js';
import { SessionSchema, DocumentSchema, DocumentVersionSchema, ReviewSchema } from './records.js';
export const BundleExposureSchema = z.object({id:z.string().min(1).max(300),cardId:z.string().min(1).max(100),cardVersion:z.number().int().positive(),itemFamilyId:z.string().max(150),attemptId:z.uuid().nullable(),kind:z.enum(['preview','prompt','reserved']),shownAt:z.iso.datetime()}).strict();
export const BundleSchema = z.object({
 format:z.literal('obrazownik'),formatVersion:z.literal(1),appVersion:z.string().max(30).default('0.1.0'),schemaVersion:z.union([z.literal(2),z.literal(3)]),exportedAt:z.iso.datetime(),
 exposureHistory:z.enum(['known','unknown']),settings:SettingsSchema,
 attempts:z.array(AttemptSchema).max(100000),versions:z.array(VersionSchema).max(500000),assistanceEvents:z.array(AssistanceSchema).max(500000),
 exposures:z.array(BundleExposureSchema).max(500000),sessions:z.array(SessionSchema).max(100000),documents:z.array(DocumentSchema).max(100000),documentVersions:z.array(DocumentVersionSchema).max(500000),reviews:z.array(ReviewSchema).max(500000),methods:z.array(MethodSchema).max(1000),cards:z.array(CardSchema).max(10000),
}).strict().superRefine((b,ctx)=>{
 const checkUnique=(items:{id:string}[], name:string)=>{if(new Set(items.map(x=>x.id)).size!==items.length)ctx.addIssue({code:'custom',message:`Powtórzone identyfikatory: ${name}`});};
 for(const [name,items] of Object.entries({attempts:b.attempts,versions:b.versions,assistance:b.assistanceEvents,exposures:b.exposures,sessions:b.sessions,documents:b.documents,documentVersions:b.documentVersions,reviews:b.reviews}))checkUnique(items,name);
 const attempts=new Map(b.attempts.map(a=>[a.id,a])),sessions=new Set(b.sessions.map(x=>x.id)),documents=new Set(b.documents.map(x=>x.id));
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 for(const id of attempts.keys())if(documents.has(id))fail('Niejednoznaczny identyfikator próby i dokumentu');
 if(new Set(b.reviews.map(r=>r.sourceAttemptId+':'+r.offsetDays)).size!==b.reviews.length)fail('Powtórzony termin powrotu');
 for(const a of b.attempts){if(a.sessionId&&!sessions.has(a.sessionId))fail('Brak sesji próby');if(a.sourceAttemptId&&!attempts.has(a.sourceAttemptId))fail('Brak źródłowej próby');if(a.sourceDocumentId&&!documents.has(a.sourceDocumentId))fail('Brak źródłowego dokumentu');}
 for(const v of [...b.versions,...b.assistanceEvents])if(!attempts.has(v.attemptId))fail('Brak próby wersji/pomocy');
 for(const e of b.exposures)if(e.attemptId&&!attempts.has(e.attemptId))fail('Brak próby ekspozycji');
 for(const v of b.documentVersions)if(!documents.has(v.documentId))fail('Brak dokumentu wersji');
 for(const r of b.reviews)if(!attempts.has(r.sourceAttemptId)||(r.attemptId&&!attempts.has(r.attemptId)))fail('Brak próby powrotu');
 for(const s of b.sessions)if(s.attemptIds.some(id=>!attempts.has(id)))fail('Brak próby sesji');
});
export type Bundle = z.infer<typeof BundleSchema>;
