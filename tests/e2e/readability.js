async function scenario(page) {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const nav = async name => {
    const button = page.getByRole('button', {name, exact: true});
    if (!await button.isVisible()) {
      const menu = page.getByRole('button', {name: /^Menu ·/});
      if (await menu.isVisible() && await menu.getAttribute('aria-expanded') === 'false') await menu.click();
    }
    await button.click();
  };
  await page.evaluate(async()=>{
    const boot=await(await fetch('/api/bootstrap')).json();
    if(!boot.dataDir.includes('obrazownik-e2e-'))throw new Error('Refusing non-test data');
    await fetch('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':boot.csrfToken},body:JSON.stringify({...boot.settings,fontSize:26,optionalMethods:['M2','M3','M5']})});
  });
  await page.reload();
  await page.getByRole('heading',{name:'Stwórz obraz krok po kroku',exact:true}).waitFor();
  const catalogue = await page.evaluate(async () => (await (await fetch('/api/cards')).json()).cards);
  const selections = ['property', 'bridge', 'verb', 'sense', 'transform'].flatMap(family => catalogue.filter(c => c.family === family && !['M2','M3','M5'].includes(c.methodId)).slice(0,2));
  selections.push(...['M2','M3','M5'].map(method => catalogue.find(c => c.methodId === method)));
  assert(selections.every(Boolean) && selections.length === 13, 'Missing families or optional methods');
  for (const card of selections) {
    await nav('Ćwiczenia');
    await page.getByRole('combobox', { name: 'Rodzaj ćwiczenia', exact: true }).selectOption(card.family);
    await page.getByRole('combobox', { name: 'Temat ćwiczenia', exact: true }).selectOption(card.id);
    await page.getByRole('button', { name: 'Otwórz wybrane ćwiczenie', exact: false }).click();
    const field = page.getByRole('textbox', { name: 'Twoje słowa', exact: true });
    await field.fill(`Syntetyczna próba ${card.id}: na parapecie szeleści cień.`);
    await page.setViewportSize({ width: 320, height: 850 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Exercise overflow: ${card.id}`);
    if (card === selections.find(c => c.family === card.family)) await page.screenshot({ path: `output/playwright/e2e-family-${card.family}.png`, fullPage: true });
    await nav('Zapisz i zakończ');
    await page.getByRole('heading', { name: 'Jest Twój ślad.', exact: true }).waitFor();
    await nav('Wróć do Dzisiaj');
  }
  for (const view of ['Start','Moje teksty','Obserwacje','Ustawienia']) {
    if (view === 'Obserwacje') {
      await nav('Moje teksty');
      await nav('Zobacz moje obserwacje z ćwiczeń →');
    } else await nav(view);
    for (const width of [320,390]) {
      await page.setViewportSize({ width, height: 850 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} overflow at ${width}`);
    }
    await page.setViewportSize({ width: 1280, height: 950 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} overflow at 200% CSS zoom`);
    await page.screenshot({ path: `output/playwright/e2e-zoom-${view === 'Start' ? 'home' : view === 'Moje teksty' ? 'notebook' : view === 'Obserwacje' ? 'observations' : 'settings'}.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  }
  await nav('Ustawienia');
  await page.getByRole('combobox', { name: 'Wielkość tekstu w całej aplikacji', exact: true }).selectOption('16');
  await nav('Zapisz ustawienia');
  await page.getByText('Ustawienia zapisane.', {exact:true}).waitFor();
  const tooSmall=await page.evaluate(()=>Array.from(document.querySelectorAll('button,label,legend,summary,p,.save-status')).filter(node=>node.getClientRects().length&&node.textContent.trim()&&parseFloat(getComputedStyle(node).fontSize)<15.99).map(node=>node.textContent.slice(0,60)));
  assert(tooSmall.length===0, `Visible text below16px: ${JSON.stringify(tooSmall)}`);
  await page.getByRole('combobox', { name: 'Wielkość tekstu w całej aplikacji', exact: true }).selectOption('26');
  await nav('Zapisz ustawienia');
  await page.getByText('Ustawienia zapisane.', {exact:true}).waitFor();
  assert(await page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize))===26,'Global font setting not applied');
  await nav('Start');
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Control+Home');
  const tabStops=await page.locator('a[href]:visible,button:visible:not(:disabled),summary:visible,input:visible:not(:disabled),select:visible:not(:disabled),textarea:visible:not(:disabled)').count();
  await page.getByRole('link',{name:'Przejdź do treści',exact:true}).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  for (let i=0;i<tabStops;i++) {
    assert(await page.evaluate(() => {
      const element = document.activeElement;
      return element && element !== document.body && getComputedStyle(element).outlineStyle !== 'none';
    }), 'Tab focus not visible');
    if(i<tabStops-1)await page.keyboard.press('Tab');
  }
  return 'READABILITY_PASS';
}
