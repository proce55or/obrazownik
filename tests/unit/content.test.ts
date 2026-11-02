import { expect, test } from "vitest";
import { allCards, methods } from "../../src/server/content.js";
import { validateContent } from "../../src/domain/content-validation.js";

test("authored package has five base families, optional variants, near transfer and a protected 20-topic reserve", () => {
  const result = validateContent(allCards, methods);
  expect(result.errors).toEqual([]);
  expect(result.status).toBe("PASS");
  expect(result.counts.baseTraining).toBeGreaterThanOrEqual(60);
  for (const count of Object.values(result.counts.baseByFamily))
    expect(count).toBeGreaterThanOrEqual(12);
  expect(result.counts.optionalTraining).toBeGreaterThanOrEqual(6);
  expect(result.counts.nearTransfer).toBeGreaterThanOrEqual(5);
  expect(result.counts.independentWriting).toBeGreaterThanOrEqual(20);
});

test("invalid cards, missing method provenance and duplicate versions are rejected", () => {
  const cards = structuredClone(allCards),
    metadata = structuredClone(methods);
  cards[0].easierInstruction = " ";
  cards[1].methodId = "missing-method";
  cards.push(structuredClone(cards[2]));
  metadata[0].licenseStatus = " ";
  const result = validateContent(cards, metadata);
  expect(result.status).toBe("FAIL");
  expect(result.errors.join("\n")).toContain("puste easierInstruction");
  expect(result.errors.join("\n")).toContain("nieistniejąca wersja metody");
  expect(result.errors.join("\n")).toContain("powtórzone id i version");
  expect(result.errors.join("\n")).toContain("puste licenseStatus");
});

test("a paraphrase with a different ID cannot cross the protected item family boundary", () => {
  const cards = structuredClone(allCards),
    reserve = cards.find((card) => card.setRole === "independent_writing")!;
  cards[0].itemFamilyId = reserve.itemFamilyId;
  cards[0].prompt.stimulus = "Inne słowa dla parafrazy chronionego tematu";
  expect(
    validateContent(cards, methods).errors.some(
      (error) =>
        error.includes("rodzina/parafraza") &&
        error.includes(reserve.itemFamilyId),
    ),
  ).toBe(true);
});

test("a verbatim reserved topic hidden in training hints is rejected even under unrelated IDs", () => {
  const cards = structuredClone(allCards),
    reserve = cards.find((card) => card.setRole === "independent_writing")!;
  cards[0].hints[1] = `Możesz zacząć od: ${reserve.prompt.stimulus.toLocaleUpperCase("pl")}.`;
  expect(
    validateContent(cards, methods).errors.some(
      (error) =>
        error.includes("ujawnia chroniony bodziec") &&
        error.includes(reserve.id),
    ),
  ).toBe(true);
});

test("independent cards cannot carry hints, and E5 must retain its authored source", () => {
  const cards = structuredClone(allCards),
    reserve = cards.find((card) => card.setRole === "independent_writing")!;
  reserve.hints = ["Niedozwolony przykład."];
  expect(validateContent(cards, methods).status).toBe("FAIL");
  const withoutSource = structuredClone(allCards);
  withoutSource.find((card) => card.family === "transform")!.sourceText = null;
  expect(
    validateContent(withoutSource, methods).errors.some((error) =>
      error.includes("E5 bez zachowanego tekstu"),
    ),
  ).toBe(true);
});

test("optional variants cannot inflate the minimum twelve cards per base family", () => {
  const cards = structuredClone(allCards);
  const bridge = cards.filter(
    (card) => card.family === "bridge" && card.methodId === "E2",
  );
  cards.splice(
    cards.findIndex((card) => card.id === bridge[0].id),
    1,
  );
  expect(
    validateContent(cards, methods).errors.some(
      (error) => error.startsWith("bridge:") && error.includes("bez M2/M3/M5"),
    ),
  ).toBe(true);
});

test("archived versions do not inflate the count of current exercise cards", () => {
  const cards = structuredClone(allCards);
  const latest = [...cards].sort((a,b) => b.version - a.version).find(card => card.family === "property" && card.setRole === "training")!;
  cards.push({ ...structuredClone(latest), version: latest.version + 1 });
  const before = validateContent(allCards, methods), after = validateContent(cards, methods);
  expect(after.errors).toEqual([]);
  expect(after.counts.cards).toBe(before.counts.cards);
  expect(after.counts.baseTraining).toBe(before.counts.baseTraining);
  expect(after.counts.archivedVersions).toBe(before.counts.archivedVersions + 1);
});
