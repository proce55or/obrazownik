async function scenario(page) {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const nav = async name => {
    const button = page.getByRole('button', {name, exact: true});
    if (!await button.isVisible()) {
      const menu = page.getByRole('button', {name: /^Menu ·/});
      if (await menu.isVisible() && await menu.getAttribute('aria-expanded') === 'false') await menu.click();
    }
    await button.click();
  };
  const origin=new URL(page.url()).origin;
  // The database is disposable and owned by this harness.
  const boot=await page.evaluate(async()=> (await fetch('/api/bootstrap')).json());
  assert(boot.dataDir.includes('obrazownik-e2e-'),'Refusing non-test data');
  await page.evaluate(async settings=>{
    const boot=await(await fetch('/api/bootstrap')).json();
    await fetch('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':boot.csrfToken},body:JSON.stringify({...settings,llmMode:'bielik',llmPrefetch:false})});
  },boot.settings);
  await page.route('**/api/attempts/*/llm/status',route=>route.fulfill({json:{status:'error',message:'Model testowo niedostępny.',prefetchEnabled:false}}));
  await page.reload();
  await nav('Ćwiczenia');
  await page.getByText('Krótka sesja z kilkoma ćwiczeniami', {exact:true}).click();
  await nav('Zaproponuj krótką sesję');
  await page.locator('.session-panel .draft-link').first().click();
  await page.getByText('Nie udało się przygotować pytania.',{exact:false}).waitFor();
  const field=page.getByRole('textbox',{name:'Twoje słowa',exact:true});
  await field.fill('Syntetyczny tekst bez działającego modelu.');
  await nav('1 · Pytanie naprowadzające');
  await nav('Zapisz i zakończ');
  await page.locator('.completed').waitFor();
  await page.getByText('O użytej pomocy',{exact:true}).click();
  await page.getByText('Źródła użytej pomocy',{exact:true}).click();
  await page.getByText('Gotowa pomoc aplikacji',{exact:true}).waitFor();
  await nav('Wróć do Dzisiaj');
  await nav('Ustawienia');
  await page.evaluate(async env=>{
    const db=await new Promise((resolve,reject)=>{const r=window.indexedDB.open('obrazownik-recovery-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readwrite');
      tx.objectStore('drafts').put({key:'qa-unknown',text:'Nieznany format zachowuje cały tekst.',futureField:{original:true}});
      tx.objectStore('drafts').put({key:'qa-known',environmentId:env,id:window.crypto.randomUUID(),baseRevision:0,text:'Pozostawiony tekst zamkniętego ćwiczenia.',title:'Kopia QA',updatedAt:new Date().toISOString()});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });db.close();
  },boot.environmentId);
  await page.getByText('Kopie ratunkowe w tej przeglądarce',{exact:true}).click();
  await nav('Odczytaj kopie');
  await page.getByText('Kopia QA ·',{exact:false}).click();
  const download=page.waitForEvent('download');
  await nav('Zapisz kopię do pliku');
  assert((await download).suggestedFilename().endsWith('.txt'),'Recovery download missing');
  await nav('Usuń tę kopię z przeglądarki');
  await page.getByText('Usunięto wybraną kopię z przeglądarki.',{exact:true}).waitFor();
  await page.getByText('Kopie w nieznanym formacie',{exact:true}).click();
  await nav('Odczytaj kopie w nieznanym formacie');
  await page.getByText('Nieznana kopia 1',{exact:true}).click();
  assert(await page.getByRole('button',{name:'Usuń tę nieznaną kopię',exact:true}).isDisabled(),'Unknown copy can be deleted before export');
  const raw=page.waitForEvent('download');
  await nav('Pobierz surową kopię JSON');
  assert((await raw).suggestedFilename().endsWith('.json'),'Raw recovery download missing');
  await page.getByRole('checkbox',{name:'Sprawdziłem pobrany plik i chcę usunąć ten wpis z przeglądarki',exact:true}).check();
  await nav('Usuń tę nieznaną kopię');
  await page.getByText('Brak kopii w nieznanym formacie.',{exact:true}).waitFor();
  await page.setViewportSize({width:320,height:850});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Recovery tools overflow320');
  await page.screenshot({path:'output/playwright/e2e-recovery-tools-320.png',fullPage:true});
  // An open request that never completes must also release the editor.
  const hung=await page.context().newPage();
  await hung.addInitScript(()=>{Object.defineProperty(window.indexedDB,'open',{configurable:true,value(){return {};}});});
  await hung.goto(origin);
  await hung.getByRole('button',{name:'Przejdź do ćwiczeń',exact:true}).click();
  await hung.getByRole('button',{name:'Otwórz wybrane ćwiczenie',exact:true}).click();
  const hungField=hung.getByRole('textbox',{name:'Twoje słowa',exact:true});
  await hungField.waitFor();
  await hung.waitForFunction(()=>document.querySelector('#response')?.disabled===false,{},{timeout:7000});
  await hungField.fill('Zapis po przekroczeniu czasu bufora.');
  await hung.getByRole('button',{name:'Zapisz i zakończ',exact:true}).click();
  await hung.locator('.completed').waitFor();
  await hung.close();
  await page.unroute('**/api/attempts/*/llm/status');
  return 'BUFFER_TOOLS_PASS';
}
