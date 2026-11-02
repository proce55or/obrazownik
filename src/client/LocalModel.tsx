import { useEffect, useState } from 'react';
import { z } from 'zod';
import type { AssistanceEvent } from '../shared/schemas';
import { api } from './api';
import './LocalModel.css';

export function modelModeLabel(mode: 'off'|'bielik'|'unknown') {
  return mode==='bielik'?'Tryb próby: lokalny Bielik':mode==='off'?'Tryb próby: bez LLM':'Tryb LLM tej próby nieznany';
}
export type BielikAssistanceState = 'delivered'|'prepared'|'none'|'unknown';
export function bielikAssistanceLabel(state: BielikAssistanceState) {
  return state==='delivered'?'Pokazano pytanie Bielika':state==='prepared'?'Odbiór pytania Bielika niepotwierdzony':state==='none'?'Nie pokazano pytania Bielika':'Historia pytań Bielika nieznana';
}
export function bielikAssistanceState(events: AssistanceEvent[], tracking: 'known'|'unknown'): BielikAssistanceState {
  const local=events.filter(event=>event.provider==='bielik_local');
  return local.some(event=>event.status==='delivered')?'delivered':local.some(event=>event.status==='prepared')?'prepared':events.some(event=>event.provider==='unknown'&&(event.status==='prepared'||event.status==='delivered'))?'unknown':tracking==='known'?'none':'unknown';
}
export function providerLabel(provider: AssistanceEvent['provider']) {
  return provider==='bielik_local'?'Pytanie lokalnego Bielika':provider==='curated'?'Gotowa pomoc aplikacji':'Źródło pomocy nieznane';
}
export function ModelSources({events}:{events:AssistanceEvent[]}) {
  const relevant=events.filter(event=>event.status!=='failed');
  if(!relevant.length)return null;
  return <details className="model-sources"><summary>Źródła użytej pomocy</summary><ul>{relevant.map(event=><li key={event.id}><strong>{providerLabel(event.provider)}</strong>{event.llm&&<><br/>{event.llm.modelId} · {event.llm.promptVersion}<br/>{new Date(event.llm.generatedAt).toLocaleString('pl-PL')}<br/>{(event.llm.generationMs/1000).toFixed(1)} s · {event.llm.cacheHit?'z bufora':'pierwsze przygotowanie'}<br/><span className="model-fingerprint">SHA256: {event.llm.modelSha256}</span></>}{event.status==='prepared'&&<p>Odbiór niepotwierdzony — pomoc mogła zostać ujawniona.</p>}</li>)}</ul></details>;
}
const RuntimeSchema=z.object({enabled:z.boolean(),available:z.boolean(),modelId:z.string().nullable(),message:z.string()});
export function ModelConnection() {
  const [result,setResult]=useState<z.infer<typeof RuntimeSchema>>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function check(){setBusy(true);setError('');try{setResult(RuntimeSchema.parse(await api('/llm/status')));}catch(failure){setResult(undefined);setError(failure instanceof Error?failure.message:'Nie udało się sprawdzić modelu.');}finally{setBusy(false);}}
  return <div className="local-model"><p>Do pomocy lokalnego modelu uruchom <strong>Start-Obrazownik-z-Bielikiem.command</strong>. Następnie wybierz Bielika i zapisz ustawienia. Nowo otwarte próby zapamiętają ten wybór. Próby samodzielne pozostają bez LLM.</p><button className="secondary-button" disabled={busy} onClick={()=>{void check();}}>{busy?'Sprawdzanie…':'Sprawdź połączenie z Bielikiem'}</button><p role="status">{error||(result?`${result.available?'Model dostępny. ':''}${result.message}${result.modelId?` · ${result.modelId}`:''}`:'Połączenie z modelem nie zostało jeszcze sprawdzone.')}</p></div>;
}
const PreparationSchema=z.object({status:z.enum(['idle','preparing','ready','error','disabled']),message:z.string(),prefetchEnabled:z.boolean().optional()});
type Preparation=z.infer<typeof PreparationSchema>;
export function LocalModel({attemptId,disabled,onReveal}:{attemptId:string;disabled:boolean;onReveal:()=>Promise<void>}) {
  const [state,setState]=useState<Preparation>(),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let active=true,timer:ReturnType<typeof setTimeout>|undefined;
    const base=`/attempts/${attemptId}/llm`;
    async function poll(initial=false){
      try{
        let value=PreparationSchema.parse(await api(`${base}/status`));
        if(!active)return;
        if(initial&&value.status==='idle'&&value.prefetchEnabled){value=PreparationSchema.parse(await api(`${base}/prefetch`,'POST',{}));if(!active)return;}
        setState(value);
        if(value.status==='preparing')timer=setTimeout(()=>{void poll();},2000);
      }catch(failure){if(active)setState({status:'error',message:failure instanceof Error?failure.message:'Nie udało się przygotować pytania. Gotowa pomoc pozostaje dostępna.'});}
    }
    void poll(true);
    return()=>{active=false;if(timer)clearTimeout(timer);};
  },[attemptId,refresh]);
  async function prepare(){setBusy(true);try{const value=PreparationSchema.parse(await api(`/attempts/${attemptId}/llm/prefetch`,'POST',{}));setState(value);setRefresh(n=>n+1);}catch(failure){setState({status:'error',message:failure instanceof Error?failure.message:'Model jest niedostępny.'});}finally{setBusy(false);}}
  async function reveal(){setBusy(true);try{await onReveal();}catch(failure){setState({status:'error',message:failure instanceof Error?failure.message:'Nie udało się pokazać pytania. Gotowa pomoc pozostaje dostępna.'});}finally{setBusy(false);}}
  return <section className="local-model" aria-label="Pomoc lokalnego Bielika"><h4>Pytanie Bielika</h4><p>Przygotowanie w tle nie ujawnia pytania i nie oznacza użycia pomocy. Pokażemy je dopiero na Twoje życzenie.</p><p role="status">{state?.message||'Sprawdzanie lokalnego modelu…'}</p>{state?.status==='ready'?<button className="secondary-button" disabled={disabled||busy} onClick={()=>{void reveal();}}>Pokaż pytanie Bielika</button>:<button className="secondary-button" disabled={disabled||busy||!state||state.status==='preparing'||state.status==='disabled'} onClick={()=>{void prepare();}}>{state?.status==='preparing'?'Bielik przygotowuje pytanie…':'Przygotuj pytanie Bielika'}</button>}{(state?.status==='error'||state?.status==='disabled')&&<p>Możesz użyć gotowych pytań poniżej albo pisać dalej. Zapis tekstu działa bez modelu.</p>}</section>;
}
