// Optional: run only with a verified local runtime. Dedicated CLI budget: 240s.
// The ordinary offline MVP suite never invokes this scenario.
async function scenario(page) {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const get=url=>page.evaluate(async url=>{const response=await fetch(url);if(!response.ok)throw new Error(`GET failed: ${url}`);return response.json();},url);
  const post=(url,body)=>page.evaluate(async({url,body})=>{
    const boot=await(await fetch('/api/bootstrap')).json();
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':boot.csrfToken},body:JSON.stringify(body)});
    return{status:response.status,body:await response.json()};
  },{url,body});
  const nav=name=>page.getByRole('button',{name,exact:true}).click();
  const runtime=await get('/api/llm/status');
  assert(runtime.available,'LOCAL_MODEL_NOT_READY: start the verified Bielik runtime before the optional test.');
  const before=(await get('/api/bootstrap')).settings;
  async function settings(mode,prefetch){
    await nav('Ustawienia i kopie');
    await page.getByRole('combobox',{name:'Pomoc w nowych ćwiczeniach',exact:true}).selectOption(mode);
    await page.getByText('Przygotowywanie dodatkowego pytania',{exact:true}).click();
    const field=page.getByRole('checkbox',{name:'Przygotuj pytanie w tle po otwarciu ćwiczenia',exact:true});
    if(prefetch)await field.check();else await field.uncheck();
    await nav('Zapisz ustawienia');
    await page.getByText('Ustawienia zapisane.',{exact:true}).waitFor();
    await nav('Dzisiaj');
  }
  async function startTraining(){
    if (!await page.locator('details.more-options').evaluate(node => node.open)) await page.getByText('Więcej możliwości', {exact:true}).click();
    await page.getByText('Wybierz ćwiczenie i własne tempo',{exact:true}).click();
    await page.getByRole('combobox',{name:'Rodzaj ćwiczenia',exact:true}).selectOption('property');
    const created=page.waitForResponse(response=>response.url().endsWith('/api/attempts')&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Otwórz wybrane ćwiczenie',exact:false}).click();
    const attempt=await(await created).json();
    await page.getByRole('textbox',{name:'Twoje słowa',exact:true}).waitFor();
    return attempt;
  }
  try{
    await settings('bielik',true);
    const attempt=await startTraining();
    assert(attempt.llmMode==='bielik','New training attempt lost selected model mode');
    await page.getByRole('button',{name:'Pokaż dodatkowe pytanie',exact:true}).waitFor({timeout:185000});
    const buffered=await get(`/api/attempts/${attempt.id}`);
    assert(!buffered.assistanceEvents.some(event=>event.provider==='bielik_local'),'Prefetch recorded revealed assistance');
    assert(await page.locator('.hint-content').count()===0,'Prefetch exposed a hidden question');
    const text='Syntetyczne QA Bielika: ciepło kamienia zostaje w dłoni. Żółć 🌿';
    await page.getByRole('textbox',{name:'Twoje słowa',exact:true}).fill(text);
    const delivered=page.waitForResponse(response=>response.url().includes(`/api/attempts/${attempt.id}/hints/`)&&response.url().endsWith('/delivered')&&response.request().method()==='POST');
    await nav('Pokaż dodatkowe pytanie');await delivered;
    const revealed=await get(`/api/attempts/${attempt.id}`),event=revealed.assistanceEvents.find(event=>event.provider==='bielik_local');
    assert(event&&event.status==='delivered'&&event.kind==='question'&&event.level===1,'Local question not delivered as level-one assistance');
    assert(event.llm&&/^[a-f0-9]{64}$/.test(event.llm.modelSha256)&&event.llm.modelId==='bielik-7b-local'&&event.llm.promptVersion,'Missing model provenance');
    assert(revealed.versions.some(version=>version.reason==='pre_hint'&&version.text===text),'Unsaved local text not captured before question');
    assert(revealed.attempt.currentText===text,'Question replaced author text');
    await page.getByText('Pytanie lokalnego Bielika',{exact:false}).waitFor();
    await nav('Pokaż dodatkowe pytanie');
    assert((await get(`/api/attempts/${attempt.id}`)).assistanceEvents.filter(event=>event.provider==='bielik_local').length===1,'Repeat reveal duplicated assistance');
    for(const width of [320,390]){
      await page.setViewportSize({width,height:850});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Local model panel overflows ${width}px`);
      await page.screenshot({path:`output/playwright/e2e-local-model-${width}.png`,fullPage:true});
    }
    await page.getByRole('button',{name:'Pokaż dodatkowe pytanie',exact:true}).focus();
    await page.keyboard.press('Tab');
    assert(await page.evaluate(()=>document.activeElement instanceof HTMLButtonElement&&getComputedStyle(document.activeElement).outlineStyle!=='none'),'Local model keyboard focus is not visible');
    await page.keyboard.press('Enter');
    await page.getByText('Gotowa pomoc aplikacji',{exact:true}).waitFor();
    assert((await get(`/api/attempts/${attempt.id}`)).attempt.currentText===text,'Keyboard assistance changed author text');
    await nav('Zapisz i zakończ');await page.getByRole('heading',{name:'Jest Twój ślad.',exact:true}).waitFor();
    await page.getByText('O użytej pomocy',{exact:true}).click();
    await page.getByText('Źródła użytej pomocy',{exact:true}).click();
    await page.getByText(`SHA256: ${event.llm.modelSha256}`,{exact:true}).waitFor();
    await nav('Wróć do Dzisiaj');
    await settings('off',false);
    const without=await startTraining();
    assert(without.llmMode==='off','Off mode did not apply to new attempt');
    assert(await page.getByRole('region',{name:'Dodatkowe pytanie',exact:true}).count()===0,'LLM panel appeared in off mode');
    await nav('Zapisz szkic i wróć');
    await settings('bielik',true);
    const createdIndependent=page.waitForResponse(response=>response.url().endsWith('/api/independent')&&response.request().method()==='POST');
    if (!await page.locator('details.more-options').evaluate(node => node.open)) await page.getByText('Więcej możliwości', {exact:true}).click();
    await page.getByRole('button',{name:'Zacznij nowy tekst',exact:false}).click();
    const independent=await(await createdIndependent).json();
    await page.getByRole('button',{name:'Potrzebuję pomocy - otwórz osobną wersję',exact:true}).waitFor();
    assert(await page.getByRole('region',{name:'Dodatkowe pytanie',exact:true}).count()===0,'Independent attempt exposed LLM panel');
    assert(independent.mode==='independent','Start button did not create an independent attempt');
    assert(independent&&independent.llmMode==='off','Independent attempt inherited LLM mode');
    const denied=await post(`/api/attempts/${independent.id}/llm/prefetch`,{});
    assert(denied.status===403&&denied.body.error.code==='llm_disabled','Independent prefetch was not denied');
    const mutationId=await page.evaluate(()=>window.crypto.randomUUID());
    const deniedHint=await post(`/api/attempts/${independent.id}/llm/hint`,{expectedRevision:independent.revision,clientMutationId:mutationId});
    assert(deniedHint.status===403&&deniedHint.body.error.code==='llm_disabled','Independent LLM assistance was not denied');
    await nav('Zapisz szkic i wróć');
    return 'LOCAL_MODEL_PASS';
  }finally{
    // Restore only global settings through the API, without navigating away from
    // an editor or masking the original assertion with a cleanup failure.
    await page.evaluate(async settings=>{
      const boot=await(await fetch('/api/bootstrap')).json();
      const response=await fetch('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':boot.csrfToken},body:JSON.stringify(settings)});
      if(!response.ok)throw new Error('LLM test settings cleanup failed');
    },before).catch(error=>console.warn(error.message));
  }
}
