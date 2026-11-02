import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Storage } from "../../src/server/storage.js";
import { cards } from "../../src/server/content.js";

const directories: string[] = [];
const stores = new Set<Storage>();
afterEach(() => {
  for (const store of stores) store.close();
  stores.clear();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
async function open(dir?: string) {
  if (!dir) {
    dir = mkdtempSync(path.join(tmpdir(), "obrazownik-scaffolding-"));
    directories.push(dir);
  }
  const store = await Storage.open(dir);
  stores.add(store);
  return store;
}
function verbCard() {
  const card = cards.find((card) => card.id === "m4-verb-02");
  if (!card) throw new Error("Brak polskiej karty M4 szukać.");
  return card;
}

test("Polish verb slots, pre_hint and final retain independent field/text snapshots after restart", async () => {
  const store = await open(),
    card = verbCard();
  let attempt = store.createAttempt(card, randomUUID());
  expect(attempt.methodSnapshot?.id).toBe("M4");
  expect(attempt.methodSnapshot?.validationStatus).toBe(
    "unvalidated_polish_app_adaptation",
  );
  expect(
    attempt.scaffoldSlots.find((slot) => slot.id === "object")?.label,
  ).toContain("Czego");
  const initialFields = {
    who: "Żółw",
    object: "źdźbła",
    where: "wśród liści",
    other: "Człowiek — śladów na śniegu",
  };
  const text = "  Żółw szuka źdźbła.\nWśród liści zostaje ślad.  ";
  attempt = store.saveAttempt(attempt.id, {
    expectedRevision: 0,
    clientMutationId: randomUUID(),
    text,
    scaffolding: initialFields,
  });
  const hint = store.prepareHint(
    attempt.id,
    {
      level: 1,
      expectedRevision: attempt.revision,
      clientMutationId: randomUUID(),
    },
    "Kto lub co jest w tej scenie?",
  );
  const preHint = store
    .versions(attempt.id)
    .find((version) => version.reason === "pre_hint")!;
  expect(preHint).toMatchObject({
    text,
    scaffolding: initialFields,
    assistanceStateAtCapture: "none_confirmed",
  });
  const finalFields = { who: "Człowiek", object: "śladu", where: "na śniegu" };
  const next = store.saveAttempt(attempt.id, {
    expectedRevision: hint.attempt.revision,
    clientMutationId: randomUUID(),
    text: "Człowiek szuka śladu.\nŚnieg milczy.",
    scaffolding: finalFields,
  });
  store.deliverHint(attempt.id, hint.event.id);
  const final = store.finish(
    attempt.id,
    { expectedRevision: next.revision, clientMutationId: randomUUID() },
    "completed",
  );
  const dir = store.dataDir;
  store.close();
  stores.delete(store);
  const reopened = await open(dir),
    detail = reopened.detail(final.id);
  expect(detail.attempt.currentText).toBe(next.currentText);
  expect(detail.attempt.scaffolding).toEqual(finalFields);
  expect(
    detail.versions.find((version) => version.reason === "pre_hint"),
  ).toEqual(preHint);
  expect(
    detail.versions.find((version) => version.reason === "final"),
  ).toMatchObject({
    text: next.currentText,
    scaffolding: finalFields,
    assistanceStateAtCapture: "assisted",
  });
});

test("same text with different fields obeys CAS and preserves the rejected tab as a separate recovery version", async () => {
  const store = await open(),
    attempt = store.createAttempt(verbCard(), randomUUID());
  const firstFields = { who: "Dziecko", object: "klucza" },
    otherFields = { who: "Wiatr", object: "przejścia" };
  const text = "Taki sam tekst obu kart.";
  const firstInput = {
    text,
    scaffolding: firstFields,
    expectedRevision: 0,
    clientMutationId: randomUUID(),
  };
  const first = store.saveAttempt(attempt.id, firstInput);
  expect(store.saveAttempt(attempt.id, firstInput)).toEqual(first);
  expect(() =>
    store.saveAttempt(attempt.id, { ...firstInput, scaffolding: otherFields }),
  ).toThrow(/Identyfikator/);
  expect(() =>
    store.saveAttempt(attempt.id, {
      text,
      scaffolding: otherFields,
      expectedRevision: 0,
      clientMutationId: randomUUID(),
    }),
  ).toThrow(/innej karcie/);
  const recovered = store.recover(attempt.id, {
    text,
    scaffolding: otherFields,
    clientMutationId: randomUUID(),
  });
  expect(recovered.scaffolding).toEqual(otherFields);
  expect(store.getAttempt(attempt.id).scaffolding).toEqual(firstFields);
  expect(store.getAttempt(attempt.id).currentText).toBe(text);
});

test("separate attempts and their helper fields are independent even for the same card", async () => {
  const store = await open(),
    card = verbCard();
  const first = store.createAttempt(card, randomUUID()),
    second = store.createAttempt(card, randomUUID());
  store.saveAttempt(first.id, {
    text: "",
    scaffolding: { who: "Pies", object: "patyka" },
    expectedRevision: 0,
    clientMutationId: randomUUID(),
  });
  store.saveAttempt(second.id, {
    text: "",
    scaffolding: { who: "Dziecko", object: "źdźbła" },
    expectedRevision: 0,
    clientMutationId: randomUUID(),
  });
  expect(store.getAttempt(first.id).scaffolding.object).toBe("patyka");
  expect(store.getAttempt(second.id).scaffolding.object).toBe("źdźbła");
});
