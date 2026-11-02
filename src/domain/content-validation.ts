import { z } from "zod";
import { ContentCardSchema, type ContentCard } from "./cards.js";
import { FamilySchema, MethodSchema } from "../shared/schemas.js";

const optionalMethods = new Set(["M2", "M3", "M5"]);
export interface ContentValidation {
  status: "PASS" | "FAIL";
  errors: string[];
  counts: {
    cards: number;
    archivedVersions: number;
    methods: number;
    baseTraining: number;
    optionalTraining: number;
    nearTransfer: number;
    independentWriting: number;
    baseByFamily: Record<z.infer<typeof FamilySchema>, number>;
  };
}
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("pl")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function uniqueSlotIds(slots: Array<{ id: string; label: string }>): boolean {
  return (
    slots.every((slot) => slot.label.trim()) &&
    new Set(slots.map((slot) => slot.id)).size === slots.length
  );
}

/** Pure validation of the authored package, never of the user's private texts.
 * Exact text checks supplement the editorial itemFamilyId map; they are not a
 * semantic detector. Paraphrase relationships still require human review.
 */
export function validateContent(
  rawCards: unknown,
  rawMethods: unknown,
): ContentValidation {
  const errors: string[] = [];
  const counts: ContentValidation["counts"] = {
    cards: 0,
    archivedVersions: 0,
    methods: 0,
    baseTraining: 0,
    optionalTraining: 0,
    nearTransfer: 0,
    independentWriting: 0,
    baseByFamily: { property: 0, bridge: 0, verb: 0, sense: 0, transform: 0 },
  };
  const cardResult = z.array(ContentCardSchema).safeParse(rawCards),
    methodResult = z.array(MethodSchema).safeParse(rawMethods);
  if (!cardResult.success)
    for (const issue of cardResult.error.issues)
      errors.push(`cards.${issue.path.join(".")}: ${issue.message}`);
  if (!methodResult.success)
    for (const issue of methodResult.error.issues)
      errors.push(`methods.${issue.path.join(".")}: ${issue.message}`);
  if (!cardResult.success || !methodResult.success)
    return { status: "FAIL", errors, counts };
  const cards = cardResult.data,
    methods = methodResult.data;
  counts.cards = cards.length;
  counts.methods = methods.length;
  const methodKeys = new Set<string>();
  for (const method of methods) {
    const key = `${method.id}:${method.version}`;
    if (methodKeys.has(key)) errors.push(`${key}: powtórzona wersja metody`);
    methodKeys.add(key);
    for (const field of [
      "title",
      "adaptationNote",
      "contentOrigin",
      "licenseStatus",
    ] as const)
      if (!method[field].trim()) errors.push(`${key}: puste ${field}`);
    if (!uniqueSlotIds(method.slots))
      errors.push(`${key}: puste etykiety lub powtórzone pola metody`);
    if (
      method.sourceRefs.some(
        (ref) => Number(ref.slice(1)) < 1 || Number(ref.slice(1)) > 22,
      )
    )
      errors.push(`${key}: źródło spoza bibliografii R01–R22`);
    if (new Set(method.sourceRefs).size !== method.sourceRefs.length)
      errors.push(`${key}: powtórzone odsyłacze do źródeł`);
    if (method.basisType === "clinical_adaptation" && !method.sourceRefs.length)
      errors.push(`${key}: adaptacja bez wskazanej podstawy`);
  }
  const keys = new Set<string>(),
    latest = new Map<string, ContentCard>(),
    idFamilies = new Map<string, string>();
  const roles = new Map<string, Set<string>>();
  for (const card of cards) {
    const key = `${card.id}:${card.version}`;
    if (keys.has(key)) errors.push(`${key}: powtórzone id i version karty`);
    keys.add(key);
    if (!methodKeys.has(`${card.methodId}:${card.methodVersion}`))
      errors.push(`${key}: nieistniejąca wersja metody`);
    if (
      idFamilies.has(card.id) &&
      idFamilies.get(card.id) !== card.itemFamilyId
    )
      errors.push(
        `${key}: zmiana itemFamilyId resetowałaby znajomość poprzedniej wersji`,
      );
    idFamilies.set(card.id, card.itemFamilyId);
    const familyRoles = roles.get(card.itemFamilyId) ?? new Set<string>();
    familyRoles.add(card.setRole);
    roles.set(card.itemFamilyId, familyRoles);
    for (const field of [
      "easierInstruction",
      "contentOrigin",
      "licenseStatus",
      "itemFamilyId",
    ] as const)
      if (!card[field].trim()) errors.push(`${key}: puste ${field}`);
    for (const field of ["title", "stimulus", "instruction"] as const)
      if (!card.prompt[field].trim())
        errors.push(`${key}: puste polecenie ${field}`);
    if (card.slots && !uniqueSlotIds(card.slots))
      errors.push(`${key}: puste etykiety lub powtórzone pola karty`);
    if (card.setRole === "training" && card.partition !== "training")
      errors.push(`${key}: trening w chronionej partycji`);
    if (card.setRole === "independent_writing") {
      if (card.partition !== "reserve")
        errors.push(`${key}: chroniona rezerwa znajduje się w treningu`);
      if (card.sourceText)
        errors.push(
          `${key}: samodzielna rezerwa zawiera gotowy materiał źródłowy`,
        );
      const method = methods.find(
        (value) =>
          value.id === card.methodId && value.version === card.methodVersion,
      );
      if ((card.slots ?? method?.slots ?? []).length)
        errors.push(`${key}: samodzielna rezerwa zawiera pola rusztowania`);
    }
    if (card.family === "transform" && !card.sourceText?.trim())
      errors.push(`${key}: E5 bez zachowanego tekstu źródłowego`);
    if (!latest.has(card.id) || latest.get(card.id)!.version < card.version)
      latest.set(card.id, card);
  }
  for (const [family, familyRoles] of roles)
    if (familyRoles.size > 1)
      errors.push(
        `${family}: rodzina/parafraza występuje w różnych zbiorach (${[...familyRoles].join(", ")})`,
      );

  // New identifiers must not disguise verbatim protected prompts. This also
  // checks instructions, hints and E5 source text where a preview could leak.
  const independent = cards.filter(
    (card) => card.setRole === "independent_writing",
  );
  for (const card of cards.filter(
    (value) => value.setRole !== "independent_writing",
  )) {
    const parts = [
      card.prompt.stimulus,
      card.prompt.instruction,
      ...card.hints,
      card.sourceText ?? "",
    ].map(normalize);
    for (const protectedCard of independent) {
      const stimulus = normalize(protectedCard.prompt.stimulus);
      if (
        stimulus &&
        parts.some((part) => ` ${part} `.includes(` ${stimulus} `))
      )
        errors.push(
          `${card.id}:${card.version}: ujawnia chroniony bodziec ${protectedCard.id}, również pod innym itemFamilyId`,
        );
    }
  }
  const active = [...latest.values()];
  counts.cards = active.length;
  counts.archivedVersions = cards.length - active.length;
  const training = active.filter((card) => card.setRole === "training");
  counts.baseTraining = training.filter(
    (card) => !optionalMethods.has(card.methodId),
  ).length;
  counts.optionalTraining = training.filter((card) =>
    optionalMethods.has(card.methodId),
  ).length;
  counts.nearTransfer = active.filter(
    (card) => card.setRole === "near_transfer",
  ).length;
  const reserve = active.filter(
    (card) => card.setRole === "independent_writing",
  );
  counts.independentWriting = reserve.length;
  for (const family of FamilySchema.options) {
    counts.baseByFamily[family] = training.filter(
      (card) => card.family === family && !optionalMethods.has(card.methodId),
    ).length;
    if (counts.baseByFamily[family] < 12)
      errors.push(
        `${family}: wymagane co najmniej 12 bazowych kart, bez M2/M3/M5`,
      );
  }
  if (
    reserve.length < 20 ||
    new Set(reserve.map((card) => card.itemFamilyId)).size < 20 ||
    new Set(reserve.map((card) => normalize(card.prompt.stimulus))).size < 20
  )
    errors.push(
      "Rezerwa wymaga co najmniej 20 różnych bodźców i rodzin treści",
    );
  for (const method of optionalMethods)
    if (!training.some((card) => card.methodId === method))
      errors.push(`${method}: brak niezależnie włączanego wariantu`);
  if (!counts.nearTransfer)
    errors.push("Brak osobnego materiału bliskiego przeniesienia");
  return {
    status: errors.length ? "FAIL" : "PASS",
    errors: [...new Set(errors)],
    counts,
  };
}
