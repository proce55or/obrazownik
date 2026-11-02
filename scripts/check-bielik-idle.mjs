#!/usr/bin/env node
// A single bounded check for T18. It never opens the user's database.
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { LocalHintService } from '../dist/server/server/local-llm.js';
import { Storage } from '../dist/server/server/storage.js';
import { cards } from '../dist/server/server/content.js';
import { AttemptSchema } from '../dist/server/shared/schemas.js';
import { VERSION } from '../dist/server/shared/config.js';
const mode=process.argv[2];
if(process.argv.length!==3||!['--prepare','--verify'].includes(mode))throw new Error('Użycie: node scripts/check-bielik-idle.mjs --prepare|--verify');
const directory=path.join(os.homedir(),'Obrazownik-modele/bielik-7b/qa-night');
const baselineFile=path.join(directory,'baseline.json');
const hash=text=>createHash('sha256').update(text).digest('hex');
if(existsSync(directory)&&lstatSync(directory).isSymbolicLink())throw new Error('Folder kontroli nie może być dowiązaniem.');
mkdirSync(directory,{recursive:true,mode:0o700});
const service=new LocalHintService(directory);
try{
  const runtime=await service.runtimeStatus(false);
  if(!runtime.available)throw new Error('Zweryfikowany lokalny model jest niedostępny.');
  if(mode==='--prepare'){
    if(existsSync(baselineFile))throw new Error('Próba jest już przygotowana; użyj --verify, nie usuwaj jej.');
    const store=await Storage.open(directory);
    let attempt;
    try{store.updateSettings({...store.settings(),llmMode:'bielik'});attempt=store.createAttempt(cards.find(c=>c.id==='property-stone-01'),randomUUID());}finally{store.close();}
    service.prefetch(attempt);await service.drained();
    const question=service.ready(attempt);
    const baseline={kind:'obrazownik-synthetic-idle-check',attempt,digest:hash(question.content),llm:question.llm,preparedAt:new Date().toISOString()};
    writeFileSync(baselineFile,JSON.stringify(baseline),{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({prepared:true,preparedAt:baseline.preparedAt,directory,generationMs:question.llm.generationMs}));
  }else{
    if(lstatSync(baselineFile).isSymbolicLink())throw new Error('Baseline nie może być dowiązaniem.');
    const baseline=JSON.parse(readFileSync(baselineFile,'utf8'));
    if(baseline.kind!=='obrazownik-synthetic-idle-check')throw new Error('Nieznana próba kontrolna.');
    const attempt=AttemptSchema.parse(baseline.attempt);
    if(attempt.currentText!==''||attempt.sourceText!==null||attempt.sourceDocumentId!==null)throw new Error('Kontrola wymaga pustej syntetycznej próby.');
    const health=await fetch('http://127.0.0.1:4317/api/health',{signal:globalThis.AbortSignal.timeout(3000),redirect:'error'});
    if(!health.ok)throw new Error('Aplikacja nie odpowiada.');
    const app=await health.json();
    if(app.app!=='obrazownik'||app.version!==VERSION||app.status!=='ok')throw new Error('Odpowiada inna wersja aplikacji.');
    const cached=service.ready(attempt);
    if(!cached.llm.cacheHit||hash(cached.content)!==baseline.digest||cached.llm.generatedAt!==baseline.llm.generatedAt||cached.llm.modelSha256!==baseline.llm.modelSha256)throw new Error('Bufor nie zachował przygotowanego pytania.');
    // A distinct synthetic key forces exactly one fresh generation after idle.
    const fresh={...attempt,id:randomUUID(),cardId:`qa-idle-${randomUUID()}`};
    service.prefetch(fresh);await service.drained();
    const question=service.ready(fresh);
    const result={checkedAt:new Date().toISOString(),appVersion:app.version,modelId:runtime.modelId,cachePreserved:true,idleSince:baseline.preparedAt,generationMs:question.llm.generationMs,status:'PASS'};
    writeFileSync(path.join(directory,'last-result.json'),JSON.stringify(result),{mode:0o600});
    console.log(JSON.stringify(result));
  }
}finally{await service.close();}
