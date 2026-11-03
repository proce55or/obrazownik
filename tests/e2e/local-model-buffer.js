// Targeted real-runtime proof: autosave while a different card is preparing.
async function scenario(page) {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const get=url=>page.evaluate(async url=>{const response=await fetch(url);if(!response.ok)throw new Error(`GET failed: ${url}`);return response.json();},url);
  const nav = async name => {
    const button = page.getByRole('button', {name, exact: true});
    if (!await button.isVisible()) {
      const menu = page.getByRole('button', {name: /^Menu ·/});
      if (await menu.isVisible() && await menu.getAttribute('aria-expanded') === 'false') await menu.click();
    }
    await button.click();
  };
  const boot=await get('/api/bootstrap');
  assert(boot.dataDir.includes('obrazownik-'),'Refusing a data directory without an isolated QA marker');
  assert((await get('/api/llm/status')).available,'Verified local runtime is required');
  try{
    await nav('Ustawienia');
    await page.getByRole('combobox',{name:'Pomoc w nowych ćwiczeniach',exact:true}).selectOption('bielik');
    await page.getByText('Przygotowywanie dodatkowego pytania',{exact:true}).click();
    await page.getByRole('checkbox',{name:'Przygotuj pytanie w tle po otwarciu ćwiczenia',exact:true}).uncheck();
    await nav('Zapisz ustawienia');await page.getByText('Ustawienia zapisane.',{exact:true}).waitFor();
    await nav('Start');
    await nav('Ćwiczenia');
    await page.getByRole('combobox',{name:'Rodzaj ćwiczenia',exact:true}).selectOption('property');
    const selector=page.getByRole('combobox',{name:'Temat ćwiczenia',exact:true});
    await selector.selectOption(await selector.locator('option').nth(1).getAttribute('value'));
    const created=page.waitForResponse(response=>response.url().endsWith('/api/attempts')&&response.request().method()==='POST');
    await page.getByRole('button',{name:'Otwórz wybrane ćwiczenie',exact:false}).click();
    const attempt=await(await created).json();
    await page.getByRole('button',{name:'Przygotuj dodatkowe pytanie',exact:true}).waitFor();
    assert((await get(`/api/attempts/${attempt.id}/llm/status`)).status==='idle','Target card must have a fresh, unprepared buffer');
    await nav('Przygotuj dodatkowe pytanie');
    assert((await get(`/api/attempts/${attempt.id}/llm/status`)).status==='preparing','Model did not enter preparation');
    const field=page.getByRole('textbox',{name:'Twoje słowa',exact:true});
    const during='QA podczas buforowania: rękawiczka zachowała kształt dłoni. 🌿';
    await field.fill(during);
    await page.waitForFunction(async({id,text})=>{
      const detail=await(await fetch(`/api/attempts/${id}`)).json();
      const state=await(await fetch(`/api/attempts/${id}/llm/status`)).json();
      return detail.attempt.currentText===text&&state.status==='preparing';
    },{id:attempt.id,text:during},{timeout:5000,polling:100});
    assert(!(await get(`/api/attempts/${attempt.id}`)).assistanceEvents.some(event=>event.provider==='bielik_local'),'Preparation recorded assistance');
    await page.screenshot({path:'output/playwright/e2e-local-model-preparing.png',fullPage:true});
    await page.getByRole('button',{name:'Pokaż dodatkowe pytanie',exact:true}).waitFor({timeout:185000});
    const latest='QA tuż przed pomocą: rękawiczka nosi ciepło nieobecnej dłoni. Żółć 🌿';
    await field.fill(latest);
    const delivered=page.waitForResponse(response=>response.url().includes(`/api/attempts/${attempt.id}/hints/`)&&response.url().endsWith('/delivered')&&response.request().method()==='POST');
    await nav('Pokaż dodatkowe pytanie');await delivered;
    const detail=await get(`/api/attempts/${attempt.id}`);
    assert(detail.attempt.currentText===latest,'Disclosure did not flush latest text');
    assert(detail.versions.some(version=>version.reason==='pre_hint'&&version.text===latest),'Pre-hint snapshot is not the latest author text');
    assert(detail.assistanceEvents.some(event=>event.provider==='bielik_local'&&event.status==='delivered'),'Question was not explicitly delivered');
    await nav('Zapisz i zakończ');await page.getByRole('heading',{name:'Jest Twój ślad.',exact:true}).waitFor();
    await nav('Wróć do Dzisiaj');
    return 'LOCAL_MODEL_BUFFER_PASS';
  }finally{
    await page.evaluate(async settings=>{
      const boot=await(await fetch('/api/bootstrap')).json();
      const response=await fetch('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':boot.csrfToken},body:JSON.stringify(settings)});
      if(!response.ok)throw new Error('Buffer QA settings cleanup failed');
    },boot.settings).catch(error=>console.warn(error.message));
  }
}
