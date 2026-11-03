async function scenario(page) {
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.getByText('Więcej możliwości', {exact:true}).click();
  await page.getByRole("button", { name: /Ślad pracy.*Otwórz/ }).click();
  await page
    .getByRole("heading", { name: "Jest Twój ślad.", exact: true })
    .waitFor();
  const finalText =
    "  E2E: Rękawiczka zachowała kształt dłoni.\nZażółć gęślą jaźń — drugi wers.  ";
  assert(
    (await page.locator(".saved-text .preserve-text").textContent()) ===
      finalText,
    "Restart altered text",
  );
  assert(
    (await page.locator(".assistance-label").textContent()).includes(
      "przykładu",
    ),
    "Restart lost assistance",
  );
  await page.getByText("Jak Ci się pisało?", { exact: false }).click();
  assert(
    (await page.getByLabel("Łatwość", { exact: false }).inputValue()) === "4",
    "Rating lost",
  );
  assert(
    (await page
      .getByRole("textbox", { name: "Własna notatka", exact: true })
      .inputValue()) === "Syntetyczna obserwacja E2E.",
    "Note lost",
  );
  await page
    .getByRole("button", { name: "Wróć do Dzisiaj", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Kontynuuj szkic: Ślad po herbacie/ })
    .click();
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      r.url().includes("/api/attempts/") &&
      r.status() === 200,
  );
  await page
    .getByRole("textbox", { name: "Twoje słowa", exact: true })
    .fill("Zapis po ponownym uruchomieniu — żółć.");
  await saved;
  await page
    .getByRole("button", { name: "Zapisz szkic i wróć", exact: true })
    .click();
  return "RESTART_PASS";
}
