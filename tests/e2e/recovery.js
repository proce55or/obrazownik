async function scenario(page) {
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
    if (!request.url().startsWith("http://127.0.0.1:4317/"))
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
  await page
    .getByRole("button", { name: /Ślad po herbacie.*Kontynuuj szkic/ })
    .click();
  await page
    .getByRole("heading", { name: "Został tu niezapisany tekst", exact: true })
    .waitFor();
  await page.unroute("**/api/attempts/*");
  const recovered = patchResponse();
  await page
    .getByRole("button", { name: "Przywróć do edytora", exact: true })
    .click();
  await recovered;
  assert(
    (await page
      .getByRole("textbox", { name: "Twoje słowa", exact: true })
      .inputValue()) === "Ratunkowy żółty szkic.\nJeszcze niepotwierdzony.",
    "Rescue text lost",
  );
  const second = await page.context().newPage();
  await second.goto("http://127.0.0.1:4317/");
  await second
    .getByRole("button", { name: /Ślad po herbacie.*Kontynuuj szkic/ })
    .click();
  await second
    .getByRole("textbox", { name: "Twoje słowa", exact: true })
    .waitFor();
  // Hold the second tab's PATCH before typing, so the conflict is deterministic.
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await second.route("**/api/attempts/*", async (route) => {
    if (route.request().method() === "PATCH") {
      await gate;
    }
    await route.continue();
  });
  await second
    .getByRole("textbox", { name: "Twoje słowa", exact: true })
    .fill("Moja wersja w drugiej karcie.");
  await fillSaved("Nowszy tekst na Macu.");
  release();
  await second
    .locator(".save-status")
    .filter({ hasText: "Wersje wymagają porównania" })
    .waitFor({ timeout: 5000 })
    .catch(async () => {
      throw new Error(
        "SECOND TAB: " + (await second.locator("main").innerText()),
      );
    });
  assert(
    (await second
      .getByRole("textbox", { name: "Twoje słowa", exact: true })
      .inputValue()) === "Moja wersja w drugiej karcie.",
    "Conflict destroyed local text",
  );
  await second
    .getByRole("button", {
      name: "Zachowaj mój tekst jako osobną wersję",
      exact: true,
    })
    .click();
  await second
    .locator(".save-status")
    .filter({ hasText: "Zapisano na Macu" })
    .waitFor();
  assert(
    (await second
      .getByRole("textbox", { name: "Twoje słowa", exact: true })
      .inputValue()) === "Nowszy tekst na Macu.",
    "Recovery overwrote server text",
  );
  const listing = await get("/api/attempts?status=draft&limit=1");
  const draftId = listing.attempts[0].id;
  const recoveredDetail = await get(`/api/attempts/${draftId}`);
  assert(
    recoveredDetail.versions.some(
      (v) =>
        v.reason === "recovery" && v.text === "Moja wersja w drugiej karcie.",
    ),
    "Recovery version missing",
  );
  await second.close();
  // Let the server prepare a hint but deliberately lose its response.
  await page.route("**/api/attempts/*/hints", async (route) => {
    await route.fetch();
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "1 · Pytanie naprowadzające", exact: true })
    .click();
  await page.locator(".connection-error").waitFor();
  await page.unroute("**/api/attempts/*/hints");
  await page
    .getByRole("button", { name: "1 · Pytanie naprowadzające", exact: true })
    .click();
  await page
    .getByText("Co zostaje w filiżance, kiedy nie ma w niej już napoju?", {
      exact: true,
    })
    .waitFor();
  const retried = await get(`/api/attempts/${draftId}`);
  assert(
    retried.assistanceEvents.length === 1,
    "Lost response duplicated the hint",
  );
  assert(
    retried.versions.filter((v) => v.reason === "pre_hint").length === 1,
    "Lost response duplicated pre_hint",
  );
  await page.setViewportSize({ width: 320, height: 760 });
  await page.screenshot({
    path: "output/playwright/e2e-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Horizontal overflow at 320px",
  );
  assert(network.length === 0, "External network request");
  assert(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  return "CORE_PASS";
}
