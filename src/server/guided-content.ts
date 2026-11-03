import { CardSchema } from '../domain/cards.js';
import { MethodSchema } from '../shared/schemas.js';
import { GUIDED_CARD_ID, GUIDED_METHOD_ID, GUIDED_STEPS } from '../shared/guided.js';

// Separate IDs keep historical cards, independent prompts and observations intact.
export const guidedMethod = MethodSchema.parse({
  id: GUIDED_METHOD_ID, version: 1, language: 'pl',
  title: 'Od szczegółu do małej sceny — ćwiczenie prowadzone',
  sourceRefs: [], sourceLinks: [], basisType: 'creative_hypothesis',
  adaptationNote: 'Trzy etapy pisania z informacją zwrotną lokalnego modelu. Ćwiczenie twórcze; nie jest oceną zdrowia, talentu ani skuteczności terapii.',
  validationStatus: 'unvalidated_polish_app_adaptation',
  contentOrigin: 'Autorskie polecenia Obrazownika, wersja 1.',
  licenseStatus: 'Treści aplikacji; odpowiedzi pozostają własnością autora.', slots: [],
});
export const guidedCard = CardSchema.parse({
  id: GUIDED_CARD_ID, version: 1, family: 'bridge', partition: 'training',
  prompt: {title: 'Od kamienia do obrazu', stimulus: 'Kamień nad rzeką', instruction: GUIDED_STEPS[0].instruction},
  constraints: [], methodId: GUIDED_METHOD_ID, methodVersion: 1,
  language: 'pl', responseMode: 'open_writing', itemFamilyId: 'guided-stone-image', setRole: 'training',
  difficultyTags: ['guided'], contentOrigin: 'Autorskie ćwiczenie prowadzone Obrazownika.',
  licenseStatus: 'Treści aplikacji.', editorialStatus: 'reviewed',
  easierInstruction: GUIDED_STEPS[0].instruction,
});
