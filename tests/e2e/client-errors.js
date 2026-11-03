async function scenario(page) {
  const origin = new URL(page.url()).origin;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const browser = page.context().browser();
  const context = await browser.newContext();
  const errors = [];
  const tab = await context.newPage();
  tab.on('pageerror', error => errors.push(error.message));
  const api = (target, url, method = 'GET', body) => target.evaluate(async ({url, method, body}) => {
    const boot = await (await fetch('/api/bootstrap')).json();
    const response = await fetch('/api' + url, {
      method,
      headers: method === 'GET' ? {} : {'Content-Type': 'application/json', 'X-CSRF-Token': boot.csrfToken},
      ...(method === 'GET' ? {} : {body: JSON.stringify(body)})
    });
    if (!response.ok) throw new Error(`${method} ${url}: ${response.status}`);
    return response.json();
  }, {url, method, body});
  const nav = async (target, name) => {
    const button = target.getByRole('button', {name, exact: true});
    if (!await button.isVisible()) {
      const menu = target.getByRole('button', {name: /^Menu ·/});
      if (await menu.isVisible() && await menu.getAttribute('aria-expanded') === 'false') await menu.click();
    }
    await button.click();
  };
  const responseBox = target => target.getByRole('textbox', {name: 'Twoje słowa', exact: true});
  const saved = async target => { try { await target.locator('.save-status').filter({hasText: 'Zapisano na Macu'}).waitFor({timeout:5000}); } catch { throw new Error('Save did not settle: ' + (await target.locator('main').innerText()).slice(-3500)); } };
  const home = async target => {
    await target.goto(origin);
    await target.getByRole('button', {name: 'Przejdź do ćwiczeń', exact: true}).click();
  };
  const openExercise = async target => {
    const created = target.waitForResponse(r => new URL(r.url()).pathname === '/api/attempts' && r.request().method() === 'POST' && r.ok());
    await target.getByRole('combobox', {name: 'Temat ćwiczenia', exact: true}).selectOption('property-glove-01');
    await nav(target, 'Otwórz wybrane ćwiczenie');
    const attempt = await (await created).json();
    await responseBox(target).waitFor();
    await target.waitForFunction(() => !document.querySelector('#response').disabled);
    return attempt;
  };
  try {
    // Deterministic refusal releases the start request; a different topic works.
    await home(tab);
    let denied = true;
    await tab.route('**/api/attempts', route => {
      if (route.request().method() === 'POST' && denied) {
        denied = false;
        return route.fulfill({status: 400, json: {error: {code: 'invalid_request', message: 'Nie można teraz otworzyć tego ćwiczenia.'}}});
      }
      return route.continue();
    });
    await nav(tab, 'Otwórz wybrane ćwiczenie');
    await tab.getByText('Nie można teraz otworzyć tego ćwiczenia.', {exact: true}).waitFor();
    await openExercise(tab);
    await tab.unroute('**/api/attempts');
    await nav(tab, 'Zapisz szkic i wróć');
    await tab.waitForFunction(() => document.activeElement.id === 'main');
    assert(await tab.evaluate(() => document.activeElement.id === 'main'), 'Return from exercise lost focus');

    // An unknown start retries the same key and opens the already created record.
    await home(tab);
    let acceptedStart, firstStartBody;
    await tab.route('**/api/attempts', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      firstStartBody = route.request().postDataJSON();
      acceptedStart = await (await route.fetch()).json();
      await route.abort('failed');
    });
    await nav(tab, 'Otwórz wybrane ćwiczenie');
    await tab.getByRole('button', {name: 'Ponów rozpoczęcie ćwiczenia', exact: true}).waitFor();
    await tab.unroute('**/api/attempts');
    const repeatedStart = tab.waitForRequest(r => new URL(r.url()).pathname === '/api/attempts' && r.method() === 'POST');
    await nav(tab, 'Ponów rozpoczęcie ćwiczenia');
    assert((await repeatedStart).postDataJSON().clientRequestId === firstStartBody.clientRequestId, 'Unknown start changed its idempotency key');
    await tab.waitForFunction(() => document.querySelector('#response')?.disabled === false);
    const attempt = acceptedStart;

    // Ordinary 409 refusals must not turn the editor into a version conflict.
    for (const code of ['card_version', 'archive_example_unavailable', 'method_disabled', 'mutation_reused']) {
      await tab.route('**/api/attempts/*/hints', route => route.fulfill({status: 409, json: {error: {code, message: `Odmowa ${code}`}}}));
      await nav(tab, '1 · Pytanie naprowadzające');
      await tab.getByText(`Odmowa ${code}`, {exact: true}).waitFor();
      assert(await responseBox(tab).isEnabled(), `${code} incorrectly blocked writing`);
      assert(!(await tab.locator('.save-status').innerText()).includes('porównania'), `${code} incorrectly became a revision conflict`);
      await tab.unroute('**/api/attempts/*/hints');
    }
    await tab.route('**/api/attempts/*', route => route.request().method() === 'PATCH'
      ? route.fulfill({status: 409, json: {error: {code: 'card_version', message: 'Możesz nadal pisać.'}}})
      : route.continue());
    await responseBox(tab).fill('Odrzucona pierwsza treść.');
    await tab.getByText('Możesz nadal pisać.', {exact: true}).waitFor();
    assert(await responseBox(tab).isEnabled(), 'Non-revision PATCH 409 blocked writing');
    await tab.unroute('**/api/attempts/*');
    await responseBox(tab).fill('Najnowsza treść po odmowie.');
    await saved(tab);
    assert((await api(tab, `/attempts/${attempt.id}`)).attempt.currentText === 'Najnowsza treść po odmowie.', 'Deterministic failure replayed the obsolete draft');

    // A new response schema is an uncertain accepted write, with a readable message.
    await tab.route('**/api/attempts/*', async route => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const remote = await route.fetch();
      await route.fulfill({response: remote, json: {...await remote.json(), futureField: true}});
    });
    await responseBox(tab).fill('Tekst przyjęty przed aktualizacją.');
    await tab.getByText(/Aplikacja została zaktualizowana/).waitFor();
    assert(!(await tab.locator('main').innerText()).includes('unrecognized_keys'), 'Raw schema error reached the reader');
    await tab.unroute('**/api/attempts/*');
    await nav(tab, 'Ponów zapis');
    await saved(tab);
    assert((await api(tab, `/attempts/${attempt.id}`)).attempt.currentText === 'Tekst przyjęty przed aktualizacją.', 'Schema mismatch lost accepted text');

    // Lost complete/skip acknowledgements retry exactly once without duplicate finals.
    for (const skip of [false, true]) {
      if (skip) { await home(tab); await openExercise(tab); }
      const id = skip ? (await api(tab, '/attempts?status=draft&limit=1')).attempts[0].id : attempt.id;
      const text = skip ? 'Zachowany tekst pominiętego ćwiczenia.' : 'Zakończenie z utraconą odpowiedzią.';
      await responseBox(tab).fill(text);
      await saved(tab);
      const endpoint = `**/api/attempts/*/${skip ? 'skip' : 'complete'}`;
      let originalMutation;
      await tab.route(endpoint, async route => {
        originalMutation = route.request().postDataJSON();
        await route.fetch();
        await route.abort('failed');
      });
      await nav(tab, skip ? 'Pomiń ćwiczenie' : 'Zapisz i zakończ');
      await tab.getByRole('button', {name: 'Ponów zakończenie', exact: true}).waitFor();
      assert(await responseBox(tab).isDisabled(), 'Unknown terminal result allowed editing');
      await tab.unroute(endpoint);
      const retried = tab.waitForRequest(r => r.url().endsWith(`/${skip ? 'skip' : 'complete'}`));
      await nav(tab, 'Ponów zakończenie');
      assert((await retried).postDataJSON().clientMutationId === originalMutation.clientMutationId, 'Terminal retry changed mutation identity');
      await tab.locator('.completed').waitFor();
      const detail = await api(tab, `/attempts/${id}`);
      assert(detail.attempt.currentText === text, 'Terminal operation lost text');
      assert(detail.versions.filter(v => v.reason === 'final').length === (skip ? 0 : 1), 'Terminal retry duplicated final version');
      await nav(tab, 'Wróć do Dzisiaj');
      await tab.waitForFunction(() => document.activeElement.id === 'main');
    assert(await tab.evaluate(() => document.activeElement.id === 'main'), 'Return from completed lost focus');
    }

    // Closed attempts remain guarded, while a local copy can be preserved.
    await home(tab);
    const closed = await openExercise(tab);
    await responseBox(tab).fill('Lokalny tekst sprzed zamknięcia.');
    await saved(tab);
    await api(tab, `/attempts/${closed.id}/complete`, 'POST', {expectedRevision: (await api(tab, `/attempts/${closed.id}`)).attempt.revision, clientMutationId: globalThis.crypto.randomUUID()});
    await nav(tab, '1 · Pytanie naprowadzające');
    await tab.locator('.save-status').filter({hasText: 'Wersje wymagają porównania'}).waitFor();
    assert(await responseBox(tab).isDisabled(), 'attempt_closed allowed mutation');
    await tab.waitForFunction(() => document.activeElement.classList.contains('connection-error'));
    assert(await tab.evaluate(() => document.activeElement.classList.contains('connection-error')), 'Conflict panel did not receive focus');
    await nav(tab, 'Zachowaj mój tekst jako osobną wersję');
    await tab.locator('.completed').waitFor();

    // Document title and body share autosave/recovery. A lost PATCH is replayable.
    await home(tab);
    await nav(tab, 'Moje teksty');
    await tab.getByRole('button', {name: 'Nowy tekst', exact: false}).click();
    await tab.getByLabel('Tytuł', {exact: true}).fill('Dokument błędów klienta');
    await nav(tab, 'Utwórz tekst');
    const docTitle = tab.getByLabel('Tytuł', {exact: true});
    await docTitle.fill('Tytuł zapisany automatycznie');
    await saved(tab);
    const docs = await api(tab, '/documents?limit=100&offset=0');
    const doc = docs.documents.find(value => value.title === 'Tytuł zapisany automatycznie');
    assert(doc, 'Title alone did not autosave');
    const secondDocument = await context.newPage();
    await home(secondDocument);
    await nav(secondDocument, 'Moje teksty');
    await secondDocument.locator('.notebook-list article').filter({hasText: doc.title}).getByRole('button', {name: 'Otwórz tekst', exact: true}).click();
    let releaseDocument;
    const documentGate = new Promise(resolve => { releaseDocument=resolve; });
    await secondDocument.route('**/api/documents/*', async route => {
      if (route.request().method() === 'PATCH') await documentGate;
      await route.continue();
    });
    await secondDocument.getByLabel('Twój tekst', {exact: true}).fill('Osobna wersja dokumentu z drugiej karty.');
    await tab.getByLabel('Twój tekst', {exact: true}).fill('Nowsza treść dokumentu na Macu.');
    await saved(tab);
    releaseDocument();
    await secondDocument.locator('.save-status').filter({hasText: 'Wersje wymagają porównania'}).waitFor();
    assert(await secondDocument.getByLabel('Twój tekst', {exact: true}).isDisabled(), 'Document conflict allowed overwrite');
    await secondDocument.waitForFunction(() => document.activeElement.classList.contains('connection-error'));
    assert(await secondDocument.evaluate(() => document.activeElement.classList.contains('connection-error')), 'Document conflict did not receive focus');
    await nav(secondDocument, 'Zachowaj mój tekst jako osobną wersję');
    await saved(secondDocument);
    const documentConflict = await api(tab, `/documents/${doc.id}`);
    assert(documentConflict.document.currentText === 'Nowsza treść dokumentu na Macu.', 'Document recovery overwrote current text');
    assert(documentConflict.versions.some(v => v.text === 'Osobna wersja dokumentu z drugiej karty.'), 'Document recovery version missing');
    await secondDocument.close();
    // The separately preserved version advanced the shared revision. Reopen the
    // clean first tab before testing an unrelated lost network acknowledgement.
    await nav(tab, 'Zapisz i wróć do zeszytu');
    await tab.locator('.notebook-list article').filter({hasText: doc.title}).getByRole('button', {name: 'Otwórz tekst', exact: true}).click();
    let lostDocumentMutation;
    await tab.route('**/api/documents/*', async route => {
      if (route.request().method() !== 'PATCH') return route.continue();
      lostDocumentMutation = route.request().postDataJSON();
      await route.fetch();
      await route.abort('failed');
    });
    await tab.getByLabel('Twój tekst', {exact: true}).fill('Dokument z niepotwierdzoną odpowiedzią.');
    await tab.getByText('Brak połączenia z lokalną aplikacją.', {exact: false}).waitFor();
    await tab.unroute('**/api/documents/*');
    const replay = tab.waitForRequest(r => r.method() === 'PATCH' && r.url().endsWith(`/documents/${doc.id}`));
    await nav(tab, 'Ponów zapis');
    assert((await replay).postDataJSON().clientMutationId === lostDocumentMutation.clientMutationId, 'Document retry changed mutation identity');
    await saved(tab);
    await tab.route('**/api/documents/*', route => route.request().method() === 'PATCH' ? route.abort('failed') : route.continue());
    await docTitle.fill('Odzyskany tytuł');
    await tab.getByText('Brak połączenia z lokalną aplikacją.', {exact: false}).waitFor();
    await tab.unroute('**/api/documents/*');
    tab.once('dialog', dialog => dialog.accept());
    await tab.reload();
    await nav(tab, 'Moje teksty');
    await tab.locator('.notebook-list article').filter({hasText: 'Tytuł zapisany automatycznie'}).getByRole('button', {name: 'Otwórz tekst', exact: true}).click();
    await tab.getByRole('heading', {name: 'Odnaleziono niezapisany tekst', exact: true}).waitFor();
    await tab.waitForFunction(() => document.activeElement.classList.contains('recovery-panel'));
    assert(await tab.evaluate(() => document.activeElement.classList.contains('recovery-panel')), 'Recovery panel did not receive focus');
    await nav(tab, 'Przywróć do edytora');
    await saved(tab);
    assert((await api(tab, `/documents/${doc.id}`)).document.title === 'Odzyskany tytuł', 'Recovery lost title-only edit');
    await nav(tab, 'Zapisz i wróć do zeszytu');
    await tab.waitForFunction(() => document.activeElement.id === 'main');
    assert(await tab.evaluate(() => document.activeElement.id === 'main'), 'Document return lost focus');

    // Failure to open IndexedDB cannot lock the server-backed editor.
    const unavailable = await context.newPage();
    await unavailable.addInitScript(() => {
      Object.defineProperty(window.indexedDB, 'open', {configurable: true, value() { throw new Error('Test: unavailable'); }});
    });
    await home(unavailable);
    const noBuffer = await openExercise(unavailable);
    await unavailable.getByText('Bufor ratunkowy jest niedostępny lub pełny.', {exact: false}).waitFor();
    await responseBox(unavailable).fill('Zapis działa bez bufora przeglądarki.');
    await nav(unavailable, 'Zapisz i zakończ');
    await unavailable.locator('.completed').waitFor();
    assert((await api(unavailable, `/attempts/${noBuffer.id}`)).attempt.currentText === 'Zapis działa bez bufora przeglądarki.', 'Unavailable buffer blocked persistence');
    await unavailable.close();
    assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    return 'CLIENT_ERRORS_PASS';
  } finally {
    await context.close();
  }
}
