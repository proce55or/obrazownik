// Opt-in: three real local model calls; all application data live in the runner's tmpdir.
async function scenario(page) {
  const assert = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const get = (url) =>
    page.evaluate(async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(url);
      return r.json();
    }, url);
  assert(
    (await get("/api/llm/status")).available,
    "Local Bielik is required for guided acceptance",
  );
  await page
    .getByRole("button", { name: "Zacznij z Bielikiem", exact: false })
    .click();
  const answer = page.getByRole("textbox", {
    name: "Twoja odpowiedź",
    exact: true,
  });
  await answer.waitFor();
  const draft = (await get("/api/bootstrap")).drafts.find((a) => a.guided);
  assert(draft, "Guided start failed");
  const base = `/api/attempts/${draft.id}`;
  const texts = [
    "Niewielki kamień ma szorstką powierzchnię.",
    "Kamień jest szorstki jak stara deska.",
    "Kamień jest szorstki jak stara deska. Nurt obraca go powoli pod moją dłonią.",
  ];
  const feedbackRoute = `**${base}/guided/feedback`;
  await answer.fill(texts[0]);
  // A definite model outage must not lock editing or navigation.
  await page.route(feedbackRoute, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "guided_unavailable",
          message: "Bielik jest niedostępny.",
          retryable: true,
        },
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Poproś Bielika o wskazówkę", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Bielik jest niedostępny." })
    .waitFor();
  assert(
    await answer.isEnabled(),
    "Confirmed unavailable model locked the answer",
  );
  assert(
    await page
      .getByRole("button", { name: "Zapisz szkic i wróć", exact: false })
      .isEnabled(),
    "Confirmed outage locked pause",
  );
  await page.unroute(feedbackRoute);
  for (let step = 0; step < 3; step++) {
    await answer.fill(texts[step]);
    if (step === 0) {
      // Drop a successful response, then retry the same operation without generating twice.
      await page.route(
        feedbackRoute,
        async (route) => {
          const response = await route.fetch({ timeout: 185000 });
          assert(
            response.ok(),
            "Real feedback failed: " + (await response.text()),
          );
          await route.abort("failed");
        },
        { times: 1 },
      );
    }
    await page
      .getByRole("button", { name: "Poproś Bielika o wskazówkę", exact: true })
      .click();
    if (step === 0) {
      await page
        .getByRole("button", { name: "Ponów prośbę o wskazówkę", exact: true })
        .waitFor({ timeout: 190000 });
      await page
        .getByRole("button", { name: "Ponów prośbę o wskazówkę", exact: true })
        .click();
    }
    const feedback = page.getByRole("region", {
      name: "Wskazówka lokalnego Bielika",
      exact: true,
    });
    await feedback.waitFor({ timeout: 190000 });
    const detail = await get(base),
      review = detail.attempt.guided.feedback;
    assert(
      review &&
        review.answer === texts[step] &&
        texts[step].includes(review.feedback.quote),
      "Feedback is not anchored in the current answer",
    );
    assert(
      detail.assistanceEvents.length === step + 1,
      "Feedback retry duplicated assistance",
    );
    assert(
      review.llm.modelId === "bielik-7b-local" &&
        review.llm.promptVersion === "obrazownik-guided-1",
      "Wrong model provenance",
    );
    if (step === 0) {
      await page.screenshot({
        path: "output/playwright/guided-feedback.png",
        fullPage: true,
      });
      await answer.fill(texts[0] + " ");
      assert(
        await page
          .getByRole("button", { name: "Przejdź do kroku 2", exact: false })
          .isDisabled(),
        "Stale feedback allowed advancing",
      );
      await answer.fill(texts[0]);
    }
    if (step < 2) {
      await page
        .getByRole("button", {
          name: `Przejdź do kroku ${step + 2}`,
          exact: false,
        })
        .click();
      await page
        .getByText(`KROK ${step + 2} Z 3 · KAMIEŃ NAD RZEKĄ`, { exact: true })
        .waitFor();
      assert(
        (await answer.inputValue()) === "",
        "Next stage retained old answer as new input",
      );
      if (step === 0) {
        await page.reload();
        await page
          .getByRole("button", { name: "Kontynuuj szkic:", exact: false })
          .click();
        await answer.waitFor();
        assert(
          (await get(base)).attempt.guided.history[0].answer === texts[0],
          "Reload lost stage history",
        );
      }
    } else {
      await page
        .getByRole("button", {
          name: "Zakończ i zachowaj ćwiczenie",
          exact: true,
        })
        .click();
      await page
        .getByRole("heading", {
          name: "Od szczegółu do Twojej sceny",
          exact: true,
        })
        .waitFor();
    }
  }
  const final = await get(base);
  assert(
    final.attempt.status === "completed" &&
      final.attempt.currentText === texts[2] &&
      final.attempt.guided.history.length === 2,
    "Incomplete guided history",
  );
  await page.screenshot({
    path: "output/playwright/guided-completed.png",
    fullPage: true,
  });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Guided completion overflow " + width,
    );
  }
  const exported = await get("/api/export");
  assert(
    exported.attempts.find((a) => a.id === draft.id).guided.history.length ===
      2,
    "Export lost guided history",
  );
  return "GUIDED_PASS";
}
