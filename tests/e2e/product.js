async function scenario(page) {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const get = url => page.evaluate(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET failed: ${url}`);
    return response.json();
  }, url);
  const errors = [], external = [];
  const origin = new URL(page.url()).origin;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(origin + '/') && !request.url().startsWith('blob:')) external.push(request.url()); });
  const nav = name => page.getByRole('button', { name, exact: true }).click();
  const complete = async text => {
    await page.getByRole('textbox', { name: 'Twoje słowa', exact: true }).fill(text);
    await nav('Zapisz i zakończ');
    await page.getByRole('heading', { name: 'Jest Twój ślad.', exact: true }).waitFor();
    await nav('Wróć do Dzisiaj');
  };
  await nav('Zeszyt');
  await page.getByRole('button', { name: 'Nowy tekst', exact: false }).click();
  await page.getByRole('textbox', { name: 'Tytuł', exact: true }).fill('Źródło [E2E]');
  await nav('Utwórz tekst');
  const source = 'Zażółć gęślą jaźń.\n<script>window.e2eInjected=true</script>\nLiść szura po kamieniu.';
  await page.getByRole('textbox', { name: 'Twój tekst', exact: true }).fill(source);
  await nav('Zachowaj wersję');
  await page.getByText('Zachowane wersje (1)', { exact: true }).waitFor();
  const docs = await get('/api/documents?limit=20&offset=0');
  const doc = docs.documents.find(item => item.title === 'Źródło [E2E]');
  assert(doc && doc.currentText === source, 'Document not flushed before manual version');
  const markdown = await page.evaluate(async id => (await fetch(`/api/documents/${id}/markdown`)).text(), doc.id);
  assert(markdown.includes('\n\n') && markdown.includes(source), 'Markdown lost newlines or text');
  const download = page.waitForEvent('download');
  await nav('Pobierz Markdown');
  assert((await download).suggestedFilename().endsWith('.md'), 'Markdown download missing');
  await nav('Przekształć w ćwiczeniu');
  await page.getByRole('heading', { name: 'Tekst źródłowy - pozostaje zachowany', exact: true }).waitFor();
  assert(await page.evaluate(() => window.e2eInjected) === undefined, 'HTML executed');
  await page.getByText('Wybierz słowa z fragmentu', { exact: true }).click();
  await page.locator('.word-bank button').first().click();
  assert((await page.getByRole('textbox', { name: 'Twoje słowa', exact: true }).inputValue()).includes('Zażółć'), 'Source word button failed');
  await complete('Nowy własny fragment. Liść przemierza kamienną drogę.');
  assert((await get(`/api/documents/${doc.id}`)).document.currentText === source, 'E5 overwrote source');
  for (const family of ['bridge', 'sense', 'transform']) {
    if (!await page.locator('details.more-options').evaluate(node => node.open)) await page.getByText('Więcej możliwości', {exact:true}).click();
    await page.getByText('Wybierz ćwiczenie i własne tempo', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Rodzaj ćwiczenia', exact: true }).selectOption(family);
    await page.getByRole('checkbox', { name: 'Łatwiejszy wariant', exact: true }).check();
    await page.getByRole('button', { name: 'Otwórz wybrane ćwiczenie', exact: false }).click();
    await complete(`Własny tekst rodziny ${family}: żółty promień opiera się o próg.`);
  }
  await nav('Ustawienia i kopie');
  await page.getByRole('combobox', { name: 'Wielkość tekstu w całej aplikacji', exact: true }).selectOption('26');
  await page.getByText('Dodatkowe rodzaje ćwiczeń',{exact:true}).click();
  for (const label of ['Jedno słowo, kilka dróg', 'Pojęcie w sytuacji', 'Wspólna cecha i metafora']) {
    await page.getByRole('checkbox', { name: label, exact: true }).check();
    await nav('Zapisz ustawienia');
    await page.getByText('Ustawienia zapisane.', { exact: true }).waitFor();
  }
  const boot = await get('/api/bootstrap');
  assert(boot.settings.fontSize === 26 && boot.settings.optionalMethods.length === 3, 'Settings not persisted');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 950 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Settings overflow at ${width}`);
  }
  await nav('Utwórz i sprawdź kopię');
  await page.getByText('Kopia została utworzona i sprawdzona.', { exact: false }).waitFor();
  const exported = page.waitForEvent('download');
  await nav('Eksportuj wszystkie dane JSON');
  assert((await exported).suggestedFilename().endsWith('.json'), 'JSON download missing');
  const bundle = await get('/api/export');
  const file = { name: 'obrazownik-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) };
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('Plik Obrazownika JSON (do 25 MB)', { exact: true }).setInputFiles(file);
    await page.getByRole('heading', { name: 'Podgląd importu', exact: true }).waitFor();
    await nav('Utwórz kopię i scal dane');
    await page.getByText(i ? 'Ten plik został już dodany. Nie utworzono duplikatów.' : 'Dane z pliku zostały dodane.', { exact: false }).waitFor();
  }
  await page.screenshot({ path: 'output/playwright/e2e-settings.png', fullPage: true });
  await nav('Obserwacje');
  const observations = await get('/api/observations?limit=30&offset=0');
  assert(observations.samples.length >= 2, 'Missing comparison samples');
  await page.getByRole('combobox', { name: 'Pierwsza próbka', exact: true }).selectOption(observations.samples[0].id);
  await page.getByRole('combobox', { name: 'Druga próbka', exact: true }).selectOption(observations.samples[1].id);
  await page.getByRole('heading', { name: 'Tekst 1', exact: true }).waitFor();
  await nav('Losuj kolejność');
  await page.screenshot({ path: 'output/playwright/e2e-observations.png', fullPage: true });
  await nav('Dzisiaj');
  await nav('Zaproponuj krótką sesję');
  await page.getByRole('heading', { name: 'Twoja krótka sesja', exact: true }).waitFor();
  await page.locator('.session-panel .draft-link').first().click();
  await complete('Własny tekst krótkiej sesji — słowa zostały zachowane.');
  await nav('Zakończ sesję na dziś');
  await page.getByText('Sesja zakończona. Twoje teksty są zapisane. Kopia dnia została sprawdzona.', { exact: true }).waitFor();
  assert((await get('/api/backups')).backups.some(b => b.name.startsWith('auto-')), 'Daily backup missing');
  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.activeElement instanceof HTMLButtonElement || document.activeElement instanceof HTMLAnchorElement || document.activeElement instanceof HTMLSelectElement), 'Keyboard focus missing');
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  assert(external.length === 0, `External requests: ${external.join('; ')}`);
  return 'PRODUCT_PASS';
}
