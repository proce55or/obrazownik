import { z } from 'zod';
import { LocalLlmProvenanceSchema } from './llm-provenance.js';

export const GUIDED_CARD_ID = 'guided-stone-image-v1';
export const GUIDED_METHOD_ID = 'guided-imagery-local';
export const GUIDED_STEPS = [
  {
    title: 'Zauważ jedną cechę',
    instruction: 'Wyobraź sobie kamień nad rzeką. Napisz jedno zdanie o jego wyglądzie albo dotyku. Wybierz jedną konkretną cechę, na przykład temperaturę, kolor lub fakturę.',
    purpose: 'Konkretny szczegół pomaga czytelnikowi zobaczyć lub poczuć to, co opisujesz.',
    placeholder: 'Napisz, jaki jest ten kamień…',
  },
  {
    title: 'Znajdź porównanie',
    instruction: 'Do czego możesz porównać kamień z poprzedniego zdania? Napisz porównanie ze słowem „jak”. Zachowaj wspólną cechę kamienia i wybranego przedmiotu.',
    purpose: 'Porównanie łączy dwie rzeczy przez wspólną cechę i tworzy nowy obraz.',
    placeholder: 'Ten kamień jest… jak…',
  },
  {
    title: 'Ożyw małą scenę',
    instruction: 'Napisz dwa lub trzy zdania o tym kamieniu. Wykorzystaj swoje porównanie i dodaj małe zdarzenie: co robi dłoń, woda albo sam kamień?',
    purpose: 'Szczegół, porównanie i działanie razem tworzą obraz, który czytelnik może sobie wyobrazić.',
    placeholder: 'Połącz swoje pomysły w małą scenę…',
  },
] as const;
export const GuidedStepSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const GuidedFeedbackSchema = z.object({
  quote: z.string().min(1).max(300),
  strength: z.string().min(1).max(600),
  improvement: z.string().min(1).max(600),
  nextQuestion: z.string().min(1).max(400),
  assessment: z.enum(['met', 'partial', 'unclear']),
}).strict();
export const GuidedReviewSchema = z.object({
  step: GuidedStepSchema,
  answer: z.string().min(1).max(50_000),
  answerRevision: z.number().int().nonnegative(),
  feedback: GuidedFeedbackSchema,
  eventId: z.uuid(),
  llm: LocalLlmProvenanceSchema,
}).strict();
export const GuidedStateSchema = z.object({
  version: z.literal(1),
  step: GuidedStepSchema,
  feedback: GuidedReviewSchema.nullable(),
  history: z.array(GuidedReviewSchema).max(2),
}).strict().superRefine((value, ctx) => {
  if (value.history.length !== value.step || value.history.some((review, index) => review.step !== index))
    ctx.addIssue({code: 'custom', message: 'Historia etapów ćwiczenia jest niespójna.'});
  if (value.feedback && value.feedback.step !== value.step)
    ctx.addIssue({code: 'custom', message: 'Informacja zwrotna dotyczy innego etapu.'});
});
export const GuidedStartSchema = z.object({clientRequestId: z.uuid()}).strict();
export type GuidedFeedback = z.infer<typeof GuidedFeedbackSchema>;
export type GuidedReview = z.infer<typeof GuidedReviewSchema>;
export type GuidedState = z.infer<typeof GuidedStateSchema>;
export type GuidedStep = z.infer<typeof GuidedStepSchema>;
export function isGuidedFeedbackCurrent(attempt: {currentText: string; guided?: GuidedState}): boolean {
  const guided = attempt.guided;
  return !!guided?.feedback && guided.feedback.step === guided.step && guided.feedback.answer === attempt.currentText;
}
export function hasGuidedIdentity(attempt: {cardId: string; cardVersion: number; methodId: string; methodVersion: number; partition: string; mode: string; setRole: string; llmMode: string; guided?: GuidedState}): boolean {
  return !!attempt.guided && attempt.cardId === GUIDED_CARD_ID && attempt.cardVersion === 1 && attempt.methodId === GUIDED_METHOD_ID && attempt.methodVersion === 1 && attempt.partition === 'training' && attempt.mode === 'training' && attempt.setRole === 'training' && attempt.llmMode === 'bielik';
}
