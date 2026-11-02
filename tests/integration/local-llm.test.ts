import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/server/app.js';
import { LocalHintService, type LocalLlmOptions } from '../../src/server/local-llm.js';
import { Storage } from '../../src/server/storage.js';
import { cards, allCards } from '../../src/server/content.js';
import { BundleSchema } from '../../src/shared/bundle.js';
const dirs:string[]=[];
const cleanup:(()=>Promise<unknown>|unknown)[]=[];
const model={modelId:'bielik-7b-local',modelSha256:'a'.repeat(64),modelPath:'/synthetic/model.gguf'};
const question='Jaki szczegół zauważysz, gdy dotkniesz tego przedmiotu?';
function fixture(){const dir=mkdtempSync(path.join(os.tmpdir(),'obrazownik-llm-'));dirs.push(dir);const manifestPath=path.join(dir,'manifest.json');writeFileSync(manifestPath,JSON.stringify(model));return{dir,manifestPath};}
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
async function apiFixture(options:LocalLlmOptions={}){
  const f=fixture(),app=await createApp({dataDir:f.dir,serveClient:false,llm:{manifestPath:f.manifestPath,probe:async()=>true,generate:async()=>question,...options}});
  cleanup.push(()=>app.close());
  const headers={host:'127.0.0.1:4317'},boot=await app.inject({url:'/api/bootstrap',headers});
  const auth={...headers,origin:'http://127.0.0.1:4317',cookie:boot.cookies.map(c=>`${c.name}=${c.value}`).join('; '),'x-csrf-token':boot.json().csrfToken};
  const get=(url:string)=>app.inject({url:`/api${url}`,headers});
  const post=(url:string,payload:unknown={},method:'POST'|'PATCH'='POST')=>app.inject({url:`/api${url}`,method,headers:auth,payload:payload as object});
  await post('/settings',{...boot.json().settings,llmMode:'bielik'},'PATCH');
  const attempt=(await post('/attempts',{cardId:cards[0].id,clientRequestId:randomUUID()})).json();
  const base=`/attempts/${attempt.id}`;
  return {...f,app,get,post,attempt,base,settings:boot.json().settings};
}
test('prefetch is invisible; reveal flushes latest draft, deduplicates and preserves two distinct help sources',async()=>{
  let finish!:(v:string)=>void;
  const f=await apiFixture({generate:()=>new Promise<string>(resolve=>{finish=resolve;})});
  expect((await f.post(`${f.base}/llm/prefetch`)).json().status).toBe('preparing');
  await expect.poll(()=>typeof finish).toBe('function');
  const hidden=(await f.get(f.base)).json();
  expect(hidden.assistanceEvents).toHaveLength(0);
  expect((await f.get('/notebook')).json().attempts[0].bielikAssistanceState).toBe('none');expect(hidden.versions).toHaveLength(0);expect(hidden.attempt.revision).toBe(0);
  const before=await f.post(`${f.base}/llm/hint`,{expectedRevision:0,clientMutationId:randomUUID()});
  expect(before.statusCode).toBe(503);expect(before.json().error.code).toBe('llm_not_ready');
  finish(question);
  await expect.poll(async()=>(await f.get(`${f.base}/llm/status`)).json().status).toBe('ready');
  expect((await f.get(`${f.base}/llm/status`)).body).not.toContain(question);
  await f.post(f.base,{text:'  Żółty kamień\nna dłoni.  ',scaffolding:{czasownik:'grzeje'},expectedRevision:0,clientMutationId:randomUUID()},'PATCH');
  const stale=await f.post(`${f.base}/llm/hint`,{expectedRevision:0,clientMutationId:randomUUID()});expect(stale.statusCode).toBe(409);
  expect((await f.get(f.base)).json().assistanceEvents).toHaveLength(0);
  const input={expectedRevision:1,clientMutationId:randomUUID()};
  const shown=await f.post(`${f.base}/llm/hint`,input);expect(shown.statusCode).toBe(200);
  expect((await f.post(`${f.base}/llm/hint`,input)).json()).toEqual(shown.json());
  expect((await f.post(`${f.base}/llm/hint`,{...input,expectedRevision:2})).statusCode).toBe(409);
  const detail=(await f.get(f.base)).json();
  expect(detail.versions[0]).toMatchObject({reason:'pre_hint',text:'  Żółty kamień\nna dłoni.  ',scaffolding:{czasownik:'grzeje'},assistanceStateAtCapture:'none_confirmed'});
  expect(detail.assistanceEvents[0]).toMatchObject({provider:'bielik_local',llm:{modelSha256:model.modelSha256},status:'prepared'});
  expect((await f.get('/notebook')).json().attempts[0].bielikAssistanceState).toBe('prepared');
  await f.post(`${f.base}/hints/${shown.json().event.id}/delivered`);
  const curated=await f.post(`${f.base}/hints`,{level:1,expectedRevision:2,clientMutationId:randomUUID()});
  expect(curated.json().event.provider).toBe('curated');expect(curated.json().event.id).not.toBe(shown.json().event.id);
  await f.post(`${f.base}/hints/${curated.json().event.id}/delivered`);
  await f.post(`${f.base}/complete`,{expectedRevision:3,clientMutationId:randomUUID()});
  expect((await f.get(f.base)).json().assistanceState).toBe('assisted');
  expect((await f.get('/observations')).json().samples[0]).toMatchObject({llmMode:'bielik',bielikAssistanceState:'delivered'});
  expect((await f.get(`${f.base}/markdown`)).body).toContain(model.modelSha256);
  expect((await f.get('/notebook')).json().attempts[0].llmMode).toBe('bielik');
  const exported=(await f.get('/export')).json();expect(exported.schemaVersion).toBe(3);
  expect(BundleSchema.parse(exported).assistanceEvents[0].llm?.modelSha256).toBe(model.modelSha256);
});
test('independent attempts and attempts started without LLM never generate or reveal hints',async()=>{
  let calls=0;
  const f=await apiFixture({generate:async()=>{calls++;return question;}});
  const independent=(await f.post('/independent',{clientRequestId:randomUUID()})).json();
  expect(independent.llmMode).toBe('off');
  for(const route of ['prefetch','hint'])expect((await f.post(`/attempts/${independent.id}/llm/${route}`,route==='hint'?{expectedRevision:0,clientMutationId:randomUUID()}:{})).statusCode).toBe(403);
  expect((await f.get(`/attempts/${independent.id}/llm/status`)).json().status).toBe('disabled');
  await f.post('/settings',{...f.settings,llmMode:'off'},'PATCH');
  const without=(await f.post('/attempts',{cardId:cards[1].id,clientRequestId:randomUUID()})).json();expect(without.llmMode).toBe('off');
  expect((await f.post(`/attempts/${without.id}/llm/prefetch`)).statusCode).toBe(403);
  expect((await f.get(f.base)).json().attempt.llmMode).toBe('bielik');
  expect(calls).toBe(0);
});
test('offline model preserves save, curated hints and exports; stale metadata is not silently enabled',async()=>{
  const f=await apiFixture({probe:async()=>false});
  await f.post(`${f.base}/llm/prefetch`);
  await expect.poll(async()=>(await f.get(`${f.base}/llm/status`)).json().status).toBe('error');
  expect((await f.get('/llm/status')).json().available).toBe(false);
  expect((await f.post(f.base,{text:'Nadal piszę.',expectedRevision:0,clientMutationId:randomUUID()},'PATCH')).statusCode).toBe(200);
  expect((await f.post(`${f.base}/hints`,{level:1,expectedRevision:1,clientMutationId:randomUUID()})).json().event.provider).toBe('curated');
});
test('cache survives restart, deduplicates identical requests, isolates model versions and excludes private text',async()=>{
  const f=fixture(),store=await Storage.open(f.dir);cleanup.push(()=>store.close());
  store.updateSettings({...store.settings(),llmMode:'bielik'});
  const attempt=store.createAttempt(cards[0],randomUUID());let calls=0;let prompt='';
  const opts={manifestPath:f.manifestPath,probe:async()=>true,generate:async(value:string)=>{calls++;prompt=value;return question;}};
  const service=new LocalHintService(f.dir,opts);cleanup.push(()=>service.close());
  const privateAttempt={...attempt,currentText:'PRIVATE_DRAFT',scaffolding:{sekret:'PRIVATE_FIELD'},sourceText:'PRIVATE_SOURCE',sourceDocumentId:randomUUID(),promptSnapshot:{...attempt.promptSnapshot,title:'PRIVATE_TITLE',instruction:'PRIVATE_INSTRUCTION'}};
  service.prefetch(privateAttempt);service.prefetch(privateAttempt);await service.drained();expect(calls).toBe(1);
  expect(prompt).not.toContain('PRIVATE');expect(service.ready(privateAttempt).content).toBe(question);
  expect(service.ready(privateAttempt).llm.cacheHit).toBe(false);
  expect(service.ready({...privateAttempt,id:randomUUID()}).llm.cacheHit).toBe(true);
  expect(service.ready(privateAttempt).llm.cacheHit).toBe(false);
  const cache=path.join(f.dir,'llm-cache');for(const file of readdirSync(cache))expect(readFileSync(path.join(cache,file),'utf8')).not.toContain('PRIVATE');
  const restarted=new LocalHintService(f.dir,opts);cleanup.push(()=>restarted.close());
  expect(restarted.ready(privateAttempt).llm.cacheHit).toBe(true);expect(calls).toBe(1);
  writeFileSync(f.manifestPath,JSON.stringify({...model,modelSha256:'b'.repeat(64)}));
  expect(restarted.status(privateAttempt).status).toBe('idle');
  restarted.prefetch(privateAttempt);await restarted.drained();expect(calls).toBe(2);
  expect(restarted.ready(privateAttempt).llm.modelSha256).toBe('b'.repeat(64));
  expect(restarted.status({...privateAttempt,cardVersion:privateAttempt.cardVersion+1}).status).toBe('idle');
});
test('invalid generation and timeout do not enter the cache; bounded queue closes cleanly',async()=>{
  const f=fixture(),store=await Storage.open(f.dir);cleanup.push(()=>store.close());store.updateSettings({...store.settings(),llmMode:'bielik'});
  const attempt=store.createAttempt(cards[0],randomUUID());
  for(const generate of [async()=>'<script>bad</script>?',async(_p:string,_m:unknown,signal:AbortSignal)=>new Promise<string>((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});})]){
    const service=new LocalHintService(f.dir,{manifestPath:f.manifestPath,probe:async()=>true,generate,timeoutMs:20});cleanup.push(()=>service.close());
    service.prefetch(attempt);await service.drained();expect(service.status(attempt).status).toBe('error');expect(()=>service.ready(attempt)).toThrow(/gotowe/);
    expect(store.assistance(attempt.id)).toHaveLength(0);
  }
});
test('LLM provenance round-trips; old bundles normalize without inventing a source or duplicating help',async()=>{
  const f=fixture(),source=await Storage.open(f.dir),other=fixture(),target=await Storage.open(other.dir);cleanup.push(()=>source.close(),()=>target.close());
  source.updateSettings({...source.settings(),llmMode:'bielik'});const attempt=source.createAttempt(cards[0],randomUUID());
  const llm={modelId:model.modelId,modelSha256:model.modelSha256,promptVersion:'obrazownik-question-1',generatedAt:new Date().toISOString(),generationMs:1500,cacheHit:true};
  const shown=source.prepareLlmHint(attempt.id,{expectedRevision:0,clientMutationId:randomUUID()},question,llm);source.deliverHint(attempt.id,shown.event.id);
  const bundle=source.exportData();await target.importData(bundle,target.previewImport(bundle).digest);
  expect(target.detail(attempt.id).assistanceEvents[0].llm).toEqual(llm);
  expect(target.previewImport(bundle).conflicts).toBe(0);
  expect(BundleSchema.safeParse({...bundle,assistanceEvents:[{...bundle.assistanceEvents[0],llm:null}]}).success).toBe(false);
  expect(BundleSchema.safeParse({...bundle,assistanceEvents:[{...bundle.assistanceEvents[0],provider:'curated'}]}).success).toBe(false);
  const legacy=JSON.parse(JSON.stringify(bundle));legacy.schemaVersion=2;delete legacy.attempts[0].llmMode;delete legacy.assistanceEvents[0].provider;delete legacy.assistanceEvents[0].llm;
  const normalized=BundleSchema.parse(legacy);expect(normalized.attempts[0].llmMode).toBe('unknown');expect(normalized.assistanceEvents[0]).toMatchObject({provider:'unknown',llm:null});
  const independent=source.createIndependent(allCards,randomUUID());expect(independent.llmMode).toBe('off');
});

test('one model job runs at a time and shutdown cancels queued work',async()=>{
  const f=fixture(),store=await Storage.open(f.dir);cleanup.push(()=>store.close());store.updateSettings({...store.settings(),llmMode:'bielik'});
  const attempts=cards.slice(0,5).map(card=>store.createAttempt(card,randomUUID()));let calls=0;
  const service=new LocalHintService(f.dir,{manifestPath:f.manifestPath,probe:async()=>true,generate:async(_prompt,_model,signal)=>{
    calls++;return new Promise<string>((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('shutdown')),{once:true});});
  }});cleanup.push(()=>service.close());
  for(const attempt of attempts.slice(0,4))expect(service.prefetch(attempt).status).toBe('preparing');
  expect(service.prefetch(attempts[4]).status).toBe('error');
  await expect.poll(()=>calls).toBe(1);
  await service.close();expect(calls).toBe(1);
  for(const attempt of attempts.slice(0,4)){expect(service.status(attempt).status).toBe('error');expect(store.assistance(attempt.id)).toHaveLength(0);}
});
