import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { CardSchema } from "../domain/cards.js";
import { BundleSchema, type Bundle } from '../shared/bundle.js';
import { AttemptSchema, VersionSchema, AssistanceSchema, type Settings } from '../shared/schemas.js';
import { VERSION } from '../shared/config.js';
import { AppError } from './errors.js';
export function assertBundleSize(input:unknown){const value=JSON.stringify(input);if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>25*1024*1024)throw new AppError(413,'import_size','Plik importu przekracza 25 MiB.');}
export const digestBundle = (bundle: unknown) => createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
const records=(db:DatabaseSync,table:string)=>db.prepare(`SELECT record FROM ${table} ORDER BY rowid`).all().map(r=>JSON.parse(String(r.record)));
export function exportBundle(db:DatabaseSync,settings:Settings):Bundle {
 const exposures=db.prepare('SELECT * FROM contentExposure ORDER BY rowid').all();
 // Legacy exposures have incomplete lineage: retain them as unknown item families.
 const old=db.prepare('SELECT record FROM exposures WHERE id NOT IN (SELECT id FROM contentExposure)').all().map(r=>{const e=JSON.parse(String(r.record));return {...e,itemFamilyId:'legacy-unknown',kind:'prompt'};});
 return BundleSchema.parse({format:'obrazownik',formatVersion:1,appVersion:VERSION,schemaVersion:3,exportedAt:new Date().toISOString(),exposureHistory:String(db.prepare("SELECT value FROM appMeta WHERE key='exposureHistory'").get()?.value??'unknown'),settings,
 attempts:records(db,'attempts'),versions:records(db,'attemptVersions'),assistanceEvents:records(db,'assistanceEvents'),exposures:[...exposures,...old],sessions:records(db,'sessions'),documents:records(db,'documents'),documentVersions:records(db,'documentVersions'),reviews:records(db,'dueReviews'),methods:records(db,'methods'),cards:records(db,'cardRegistry')});
}
export function importPreview(input:unknown){assertBundleSize(input);const bundle=BundleSchema.parse(input);return {digest:digestBundle(bundle),attempts:bundle.attempts.length,documents:bundle.documents.length,versions:bundle.versions.length,exposures:bundle.exposures.length,assistanceEvents:bundle.assistanceEvents.length};}
function canonical(value:unknown):string {const sort=(v:unknown):unknown=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,sort(x)])):v;return JSON.stringify(sort(value));}
const groupsOf=(b:Bundle)=>[['sessions',b.sessions],['attempts',b.attempts],['attemptVersions',b.versions],['assistanceEvents',b.assistanceEvents],['documents',b.documents],['documentVersions',b.documentVersions],['dueReviews',b.reviews],['contentExposure',b.exposures]] as const;
function existingRecord(db:DatabaseSync,table:string,id:string):unknown|undefined {const row=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);if(!row)return undefined;const value=table==='contentExposure'?row:JSON.parse(String(row.record));return table==='attempts'?AttemptSchema.parse(value):table==='attemptVersions'?VersionSchema.parse(value):table==='assistanceEvents'?AssistanceSchema.parse(value):value;}
function planImport(db:DatabaseSync,bundle:Bundle){
 const groups=groupsOf(bundle),graph=new Map<string,Set<string>>(),conflicting=new Set<string>();let identical=0;
 const connect=(a:string,b:string)=>{if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());graph.get(a)!.add(b);graph.get(b)!.add(a);};
 for(const [table,items] of groups)for(const item of items){const old=existingRecord(db,table,item.id);if((table==='attempts'&&db.prepare('SELECT 1 FROM documents WHERE id=?').get(item.id))||(table==='documents'&&db.prepare('SELECT 1 FROM attempts WHERE id=?').get(item.id)))conflicting.add(item.id);if(old!==undefined){if(canonical(old)===canonical(item))identical++;else conflicting.add(item.id);}for(const key of ['attemptId','sourceAttemptId','sessionId','documentId','sourceDocumentId'] as const){if(key in item&&typeof item[key as keyof typeof item]==='string')connect(item.id,String(item[key as keyof typeof item]));}if('attemptIds' in item)for(const id of item.attemptIds)connect(item.id,id);}
 const remap=new Set(conflicting),queue=[...conflicting];for(let i=0;i<queue.length;i++)for(const id of graph.get(queue[i])??[])if(!remap.has(id)){remap.add(id);queue.push(id);}
 return {groups,remap,identical,conflicts:conflicting.size};
}
export function previewWithDatabase(db:DatabaseSync,input:unknown){assertBundleSize(input);const bundle=BundleSchema.parse(input),plan=planImport(db,bundle);return{...importPreview(bundle),identical:plan.identical,conflicts:plan.conflicts,remapped:plan.remap.size,settingsPreserved:true};}
export function importBundle(db:DatabaseSync,bundle:Bundle){
 const digest=digestBundle(bundle),prior=db.prepare('SELECT recordCount FROM importBatches WHERE sourceDigest=?').get(digest);
 if(prior)return{duplicate:true,recordCount:Number(prior.recordCount)};
 const {groups,remap}=planImport(db,bundle),mappings=new Map<string,string>();
 for(const id of remap)mappings.set(id,randomUUID());
 const skip=(table:string,item:{id:string})=>!remap.has(item.id)&&existingRecord(db,table,item.id)!==undefined;
 const mapped=(id:string|null)=>id===null?null:mappings.get(id)??id;
 const rewrite=(object:Record<string,unknown>)=>{const r={...object};for(const key of ['id','attemptId','sourceAttemptId','sessionId','documentId','sourceDocumentId'])if(typeof r[key]==='string')r[key]=mapped(r[key] as string);if(Array.isArray(r.attemptIds))r.attemptIds=r.attemptIds.map(id=>mapped(String(id)));return r;};
 const recordCount=groups.reduce((n,[table,items])=>n+items.filter(item=>!skip(table,item)||remap.has(item.id)).length,0);
 for(const [table,items] of [['methods',bundle.methods],['cardRegistry',bundle.cards]] as const)for(const item of items){const key=`${item.id}:${item.version}`,old=db.prepare(`SELECT record FROM ${table} WHERE key=?`).get(key);if(old&&canonical(table==='cardRegistry'?CardSchema.strip().parse(JSON.parse(String(old.record))):JSON.parse(String(old.record)))!==canonical(item))throw new AppError(409,'catalog_conflict','Ta sama wersja metody lub karty ma inną definicję. Import przerwany.');db.prepare(`INSERT OR IGNORE INTO ${table}(key,record) VALUES (?,?)`).run(key,JSON.stringify(item));}
 for(const session of bundle.sessions){if(skip('sessions',session))continue;const r=rewrite(session);db.prepare('INSERT INTO sessions(id,record) VALUES (?,?)').run(String(r.id),JSON.stringify(r));}
 for(const original of bundle.attempts){if(skip('attempts',original))continue;const r=rewrite(original);db.prepare('INSERT INTO attempts(id,revision,status,record) VALUES (?,?,?,?)').run(String(r.id),original.revision,original.status,JSON.stringify(r));}
 for(const original of bundle.documents){if(skip('documents',original))continue;const r=rewrite(original);db.prepare('INSERT INTO documents(id,revision,record) VALUES (?,?,?)').run(String(r.id),original.revision,JSON.stringify(r));}
 for(const [table,items,foreign] of [['attemptVersions',bundle.versions,'attemptId'],['assistanceEvents',bundle.assistanceEvents,'attemptId'],['documentVersions',bundle.documentVersions,'documentId','sourceDocumentId'],['dueReviews',bundle.reviews,'sourceAttemptId']] as const)for(const original of items){if(skip(table,original))continue;const r=rewrite(original);db.prepare(`INSERT INTO ${table}(id,${foreign},record) VALUES (?,?,?)`).run(String(r.id),String(r[foreign]),JSON.stringify(r));}
 for(const e of bundle.exposures){if(skip('contentExposure',e))continue;db.prepare('INSERT INTO contentExposure(id,cardId,cardVersion,itemFamilyId,attemptId,kind,shownAt) VALUES (?,?,?,?,?,?,?)').run(mapped(e.id),e.cardId,e.cardVersion,e.itemFamilyId,mapped(e.attemptId),e.kind,e.shownAt); }
 if(db.prepare("SELECT 1 FROM dueReviews GROUP BY sourceAttemptId,json_extract(record,'$.offsetDays') HAVING COUNT(*)>1").get())throw new AppError(409,'ambiguous_review','Niejednoznaczne terminy powrotów; nie scalono danych.');
 if(bundle.exposureHistory==='unknown')db.prepare("UPDATE appMeta SET value='unknown' WHERE key='exposureHistory'").run();

 db.prepare('INSERT INTO importBatches(id,sourceDigest,importedAt,recordCount) VALUES (?,?,?,?)').run(randomUUID(),digest,new Date().toISOString(),recordCount);
 return{duplicate:false,recordCount};
}
