async function scenario(page) {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const nav = name => page.getByRole('button', { name, exact: true }).click();
  const catalogue = await page.evaluate(async () => (await (await fetch('/api/cards')).json()).cards);
  const selections = ['property', 'bridge', 'verb', 'sense', 'transform'].flatMap(family => catalogue.filter(c => c.family === family && !['M2','M3','M5'].includes(c.methodId)).slice(0,2));
  selections.push(...['M2','M3','M5'].map(method => catalogue.find(c => c.methodId === method)));
  assert(selections.every(Boolean) && selections.length === 13, 'Missing families or optional methods');
  for (const card of selections) {
    await page.getByText('Wybierz rodzinę i własne tempo', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Rodzina ćwiczeń', exact: true }).selectOption(card.family);
    await page.getByRole('combobox', { name: 'Karta', exact: true }).selectOption(card.id);
    await page.getByRole('button', { name: 'Otwórz wybraną kartę', exact: false }).click();
    const field = page.getByRole('textbox', { name: 'Twoje słowa', exact: true });
    await field.fill(`Syntetyczna próba ${card.id}: na parapecie szeleści cień.`);
    await page.setViewportSize({ width: 320, height: 850 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Exercise overflow: ${card.id}`);
    if (card === selections.find(c => c.family === card.family)) await page.screenshot({ path: `output/playwright/e2e-family-${card.family}.png`, fullPage: true });
    await nav('Zapisz i zakończ');
    await page.getByRole('heading', { name: 'Jest Twój ślad.', exact: true }).waitFor();
    await nav('Wróć do Dzisiaj');
  }
  for (const view of ['Dzisiaj','Zeszyt','Obserwacje','Ustawienia i kopie']) {
    await nav(view);
    for (const width of [320,390]) {
      await page.setViewportSize({ width, height: 850 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} overflow at ${width}`);
    }
    await page.setViewportSize({ width: 1280, height: 950 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} overflow at 200% CSS zoom`);
    await page.screenshot({ path: `output/playwright/e2e-zoom-${view === 'Dzisiaj' ? 'home' : view === 'Zeszyt' ? 'notebook' : view === 'Obserwacje' ? 'observations' : 'settings'}.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  }
  await nav('Dzisiaj');
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Control+Home');
  for (let i=0;i<12;i++) {
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => {
      const element = document.activeElement;
      return element && element !== document.body && getComputedStyle(element).outlineStyle !== 'none';
    }), 'Tab focus not visible');
  }
  return 'READABILITY_PASS';
}
