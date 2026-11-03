async function scenario(page) {
  const nav = async name => {
    const button = page.getByRole('button', {name, exact: true});
    if (!await button.isVisible()) {
      const menu = page.getByRole('button', {name: /^Menu ·/});
      if (await menu.isVisible() && await menu.getAttribute('aria-expanded') === 'false') await menu.click();
    }
    await button.click();
  };
  const origin=new URL(page.url()).origin;
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const get = (url) =>
    page.evaluate(async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("API read failed");
      return r.json();
    }, url);
  const network = [],
    errors = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(origin+"/"))
      network.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const patchResponse = () =>
    page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().includes("/api/attempts/") &&
        r.status() === 200,
    );
  async function fillSaved(text) {
    const saved = patchResponse();
    await page
      .getByRole("textbox", { name: "Twoje słowa", exact: true })
      .fill(text);
    await saved;
    await page
      .locator(".save-status")
      .filter({ hasText: "Zapisano na Macu" })
      .waitFor();
  }
  await nav('Ćwiczenia');
  await page.getByRole('combobox', {name: 'Temat ćwiczenia', exact: true}).selectOption('property-glove-01');
  await nav('Otwórz wybrane ćwiczenie');
  await page
    .getByRole("textbox", { name: "Twoje słowa", exact: true })
    .waitFor({ state: "visible" });
  const firstText =
    "  Zażółć gęślą jaźń.\n" +
    "Na rękawiczce został ślad chłodu i ciepła. ".repeat(100);
  await fillSaved(firstText);
  await page.setViewportSize({ width: 1280, height: 950 });
  await page.screenshot({
    path: "output/playwright/e2e-long-text.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "1 · Pytanie naprowadzające", exact: true })
    .click();
  await page
    .getByText("W którym miejscu materiał najbardziej się zmienił?", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "2 · Prostszy krok", exact: true })
    .click();
  await page
    .getByRole("button", { name: "3 · Pokaż przykład", exact: true })
    .click();
  await page
    .locator(".assistance-label")
    .filter({ hasText: "Po obejrzeniu przykładu" })
    .waitFor();
  await page
    .getByRole("button", { name: "Schowaj podpowiedzi", exact: true })
    .click();
  assert(
    (await page.locator(".hint-content").count()) === 0,
    "Help should be hidden",
  );
  assert(
    (await page.locator(".assistance-label").textContent()).includes(
      "przykładu",
    ),
    "Closing help must not clear assistance",
  );
  const finalText =
    "  E2E: Rękawiczka zachowała kształt dłoni.\nZażółć gęślą jaźń — drugi wers.  ";
  await page
    .getByRole("textbox", { name: "Twoje słowa", exact: true })
    .fill(finalText);
  await page
    .getByRole("button", { name: "Zapisz i zakończ", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Jest Twój ślad.", exact: true })
    .waitFor();
  assert(
    (await page.locator(".saved-text .preserve-text").textContent()) ===
      finalText,
    "Final text altered",
  );
  let listing = await get("/api/attempts?status=completed&limit=1");
  const id = listing.attempts[0].id;
  const detail = await get(`/api/attempts/${id}`);
  assert(
    detail.versions.filter((v) => v.reason === "pre_hint").length === 3,
    "Missing pre_hint versions",
  );
  assert(detail.versions[0].text === firstText, "First snapshot altered");
  assert(
    detail.versions.find((v) => v.reason === "final").text === finalText,
    "Final not flushed",
  );
  assert(detail.assistanceEvents.length === 3, "Help duplicated");
  await page.getByText("Jak Ci się pisało?", { exact: false }).click();
  await page.getByLabel("Łatwość", { exact: false }).selectOption("4");
  await page
    .getByRole("textbox", { name: "Własna notatka", exact: true })
    .fill("Syntetyczna obserwacja E2E.");
  await page
    .getByRole("button", { name: "Zachowaj obserwację", exact: true })
    .click();
  await page.getByText("Zapisano Twoją obserwację.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Wróć do Dzisiaj", exact: true })
    .click();
  await page.setViewportSize({ width: 1280, height: 950 });
  await page.screenshot({
    path: "output/playwright/e2e-desktop.png",
    fullPage: true,
  });
  await nav('Ćwiczenia');
  await page.getByRole('combobox', {name: 'Temat ćwiczenia', exact: true}).selectOption('property-cup-01');
  await nav('Otwórz wybrane ćwiczenie');
  await fillSaved("Tekst na Macu.");
  await page.route("**/api/attempts/*", (route) =>
    route.request().method() === "PATCH"
      ? route.abort("failed")
      : route.continue(),
  );
  await page
    .getByRole("textbox", { name: "Twoje słowa", exact: true })
    .fill("Ratunkowy żółty szkic.\nJeszcze niepotwierdzony.");
  await page
    .locator(".save-status")
    .filter({ hasText: "Nie udało się zapisać" })
    .waitFor();
  assert(network.length === 0, "External network request");
  assert(errors.length === 0, "Browser error");
  return "BEFORE_RELOAD_PASS";
}
