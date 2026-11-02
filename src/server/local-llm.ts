import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { LocalLlmProvenanceSchema, type Attempt } from '../shared/schemas.js';
import { AppError } from './errors.js';

export const LOCAL_MODEL_URL = 'http://127.0.0.1:4320';
export const PROMPT_VERSION = 'obrazownik-question-2';
const ManifestSchema = z.object({modelId:z.literal('bielik-7b-local'),modelSha256:z.string().regex(/^[a-f0-9]{64}$/),modelPath:z.string().min(1)});
export type ModelManifest = z.infer<typeof ManifestSchema>;
const questionSchema = z.string().trim().min(12).max(400).refine(s=>s.endsWith('?') && (s.match(/\?/g)||[]).length===1 && !/[<>\n\r]/.test(s));
const CachedSchema = z.object({key:z.string(),content:questionSchema,llm:LocalLlmProvenanceSchema}).strict();
export type LocalQuestion = z.infer<typeof CachedSchema>;
export type Preparation = {status:'idle'|'preparing'|'ready'|'error'|'disabled';message:string};
type Entry = {state:Preparation;question?:LocalQuestion;ownerAttemptId?:string};
export type GenerateQuestion = (prompt:string,model:ModelManifest,signal:AbortSignal)=>Promise<string>;
export interface LocalLlmOptions {
  manifestPath?:string;
  generate?:GenerateQuestion;
  probe?:(model:ModelManifest)=>Promise<boolean>;
  timeoutMs?:number;
}
const instructions = 'Napisz po polsku jedno krótkie pytanie o własny wybór autora (najwyżej 25 słów). Nie rozwiązuj ćwiczenia. Nie dodawaj od siebie osób, rzeczy, sytuacji, czynności, skojarzeń ani porównań. Nie podawaj przykładów. Zapytaj autora, co sam zauważa lub wybiera. Zwróć wyłącznie pytanie zakończone znakiem zapytania, bez wstępu, cudzysłowów i komentarza.';
const questionGoals:Record<Attempt['family'],string> = {
  property:'Zapytaj o jedną fizyczną cechę przedmiotu, którą autor sam zauważa. Nie proponuj cechy.',
  bridge:'Zapytaj o własne skojarzenie autora między pojęciami. Nie proponuj skojarzenia ani wspólnej cechy.',
  verb:'Zapytaj, kto według autora mógłby wykonywać wybraną czynność. Nie proponuj osoby, rzeczy ani sytuacji.',
  sense:'Zapytaj, który zmysł autor chce wybrać do swojej obserwacji. Nie proponuj doznania ani sceny.',
  transform:'Zapytaj, co autor chce zachować lub zmienić we fragmencie. Nie proponuj konkretnych słów ani zmian.',
};
// No credentials, remote endpoints, tools, telemetry or redirect following.
const provider = createOpenAICompatible({baseURL:`${LOCAL_MODEL_URL}/v1`,name:'bielik-local',fetch:(url,init)=>{
  if(new URL(String(url)).origin!==LOCAL_MODEL_URL)throw new Error('Only the local model is allowed');
  return fetch(url,{...init,redirect:'error'});
}});
const generateLocal:GenerateQuestion = async(prompt,model,abortSignal)=>{
  const result=await generateText({model:provider.chatModel(model.modelId),instructions,prompt,maxOutputTokens:80,temperature:0.3,maxRetries:0,abortSignal});
  if(result.finishReason==='length')throw new Error('Incomplete question');
  return result.text;
};
async function probeLocal(model:ModelManifest){
  const signal=AbortSignal.timeout(3000);
  const [models,props]=await Promise.all([
    fetch(`${LOCAL_MODEL_URL}/v1/models`,{signal,redirect:'error'}),
    fetch(`${LOCAL_MODEL_URL}/props`,{signal,redirect:'error'}),
  ]);
  if(!models.ok||!props.ok)return false;
  const list=await models.json() as {data?:{id:string}[]};
  const info=await props.json() as {model_path?:string};
  return list.data?.some(x=>x.id===model.modelId)===true && info.model_path===model.modelPath;
}
export function assertLlmAttempt(attempt:Attempt){
  if(attempt.mode==='independent'||attempt.llmMode!=='bielik'||attempt.status!=='draft')
    throw new AppError(403,'llm_disabled','Bielik jest dostępny tylko w otwartej próbie z włączonym lokalnym modelem.');
}
export class LocalHintService {
  private entries=new Map<string,Entry>();
  private tail:Promise<void>=Promise.resolve();
  private pending=0;
  private closed=false;
  private controller?:AbortController;
  private cacheDir:string;
  constructor(dataDir:string,private options:LocalLlmOptions={}){this.cacheDir=path.join(dataDir,'llm-cache');}
  private manifest(){
    try {return ManifestSchema.parse(JSON.parse(readFileSync(this.options.manifestPath??path.join(os.homedir(),'Obrazownik-modele/bielik-7b/manifest.json'),'utf8')));}catch{return null;}
  }
  async runtimeStatus(enabled:boolean){
    const model=this.manifest();
    let available=false;
    if(model)try{available=await (this.options.probe??probeLocal)(model);}catch{/* offline is ordinary */}
    return {enabled,available,modelId:model?.modelId??null,message:available?'Bielik działa lokalnie na tym Macu.':'Uruchom Start-Obrazownik-z-Bielikiem.command. Pisanie i gotowe podpowiedzi działają bez modelu.'};
  }
  private input(attempt:Attempt,model:ModelManifest){
    // Private drafts, scaffolding and source documents never enter the model/cache.
    const material=attempt.sourceDocumentId?'Własny tekst autora.':attempt.promptSnapshot.stimulus;
    // The card's full instruction can include examples that a small model
    // otherwise repeats as its answer. Give only a stimulus and a question goal.
    const prompt=`Temat: ${material}\n${questionGoals[attempt.family]}`;
    const key=createHash('sha256').update(JSON.stringify([model.modelSha256,PROMPT_VERSION,attempt.cardId,attempt.cardVersion,prompt])).digest('hex');
    return {prompt,key};
  }
  private load(key:string,model:ModelManifest){
    const inMemory=this.entries.get(key);if(inMemory)return inMemory;
    try{
      const file=path.join(this.cacheDir,`${key}.json`);
      if(lstatSync(this.cacheDir).isSymbolicLink()||lstatSync(file).isSymbolicLink()||lstatSync(file).size>8192)return undefined;
      const question=CachedSchema.parse(JSON.parse(readFileSync(file,'utf8')));
      if(question.key!==key||question.llm.modelSha256!==model.modelSha256||question.llm.modelId!==model.modelId||question.llm.promptVersion!==PROMPT_VERSION)return undefined;
      question.llm.cacheHit=true;
      const entry:Entry={state:{status:'ready',message:'Pytanie jest gotowe w buforze. Możesz je pokazać, kiedy zechcesz.'},question};
      this.remember(key,entry);return entry;
    }catch{return undefined;}
  }
  private remember(key:string,entry:Entry){
    if(this.entries.size>=128){const oldest=[...this.entries].find(([,x])=>x.state.status!=='preparing');if(oldest)this.entries.delete(oldest[0]);}
    this.entries.set(key,entry);
  }
  status(attempt:Attempt):Preparation {
    if(attempt.mode==='independent'||attempt.llmMode!=='bielik'||attempt.status!=='draft')return {status:'disabled',message:'Ta próba odbywa się bez lokalnego modelu.'};
    const model=this.manifest();
    if(!model)return {status:'error',message:'Brakuje instalacji Bielika. Gotowe podpowiedzi pozostają dostępne.'};
    return this.load(this.input(attempt,model).key,model)?.state??{status:'idle',message:'Możesz przygotować pytanie. W tym czasie możesz swobodnie pisać.'};
  }
  prefetch(attempt:Attempt):Preparation {
    assertLlmAttempt(attempt);
    const model=this.manifest();if(!model||this.closed)return {status:'error',message:'Lokalny model jest niedostępny. Możesz pisać i używać gotowej pomocy.'};
    const {key,prompt}=this.input(attempt,model),old=this.load(key,model);
    if(old&&old.state.status!=='error')return old.state;
    if(this.pending>=4)return {status:'error',message:'Bielik przygotowuje inne pytania. Spróbuj ponownie za chwilę.'};
    const entry:Entry={ownerAttemptId:attempt.id,state:{status:'preparing',message:'Bielik przygotowuje pytanie w tle. Możesz pisać; pytanie nie zostało pokazane.'}};
    this.remember(key,entry);this.pending++;
    this.tail=this.tail.then(async()=>{
      const controller=new AbortController();this.controller=controller;
      const timer=setTimeout(()=>controller.abort(),this.options.timeoutMs??180_000);
      try{
        if(this.closed)throw new Error('Closed');
        if(!await (this.options.probe??probeLocal)(model))throw new Error('Unavailable');
        const start=performance.now();
        const raw=await (this.options.generate??generateLocal)(prompt,model,controller.signal);
        const question=CachedSchema.parse({key,content:questionSchema.parse(raw),llm:{modelId:model.modelId,modelSha256:model.modelSha256,promptVersion:PROMPT_VERSION,generatedAt:new Date().toISOString(),generationMs:performance.now()-start,cacheHit:false}});
        if(controller.signal.aborted||this.closed)throw new Error('Aborted');
        entry.question=question;entry.state={status:'ready',message:'Pytanie jest gotowe w buforze. Pokaż je tylko wtedy, gdy chcesz skorzystać z pomocy.'};
        try{
          if(!existsSync(this.cacheDir))mkdirSync(this.cacheDir,{mode:0o700});
          if(lstatSync(this.cacheDir).isSymbolicLink())throw new Error('Unsafe cache');
          const temp=path.join(this.cacheDir,`${key}.${randomUUID()}.tmp`);
          writeFileSync(temp,JSON.stringify(question),{mode:0o600,flag:'wx'});
          renameSync(temp,path.join(this.cacheDir,`${key}.json`));
        }catch{/* A cache write failure must not block writing or the prepared hint. */}
      }catch{
        entry.state={status:'error',message:'Bielik nie przygotował poprawnego pytania w dostępnym czasie. Możesz spróbować ponownie lub użyć gotowej pomocy.'};
      }finally{clearTimeout(timer);this.controller=undefined;this.pending--;}
    });
    return entry.state;
  }
  ready(attempt:Attempt):LocalQuestion {
    assertLlmAttempt(attempt);
    const model=this.manifest(),entry=model?this.load(this.input(attempt,model).key,model):undefined;
    if(!entry?.question||entry.state.status!=='ready')throw new AppError(503,'llm_not_ready','Pytanie nie jest jeszcze gotowe. Przygotuj je lub skorzystaj z gotowej pomocy.');
    // Reusing the same material in another attempt is a cache hit too, even
    // without a server restart. Do not mutate provenance shared by attempts.
    return {...entry.question,llm:{...entry.question.llm,cacheHit:entry.question.llm.cacheHit||entry.ownerAttemptId!==attempt.id}};
  }
  async drained(){await this.tail;}
  async close(){this.closed=true;this.controller?.abort();await this.tail;}
}
