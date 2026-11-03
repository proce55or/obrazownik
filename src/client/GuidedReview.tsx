import { GUIDED_STEPS, type GuidedReview } from "../shared/guided";

export const GUIDED_CRITERIA = [
  "W zdaniu jest kamień i jedna konkretna cecha, którą można zobaczyć albo poczuć dotykiem.",
  "Porównujesz kamień do innej rzeczy i pokazujesz ich wspólną cechę.",
  "W scenie zostają szczegół i porównanie, a do tego pojawia się małe zdarzenie.",
] as const;

export function ReviewContent({ review }: { review: GuidedReview }) {
  const feedback = review.feedback;
  return (
    <div className="guided-review-content">
      <p className="review-assessment">
        {feedback.assessment === "met"
          ? "Według Bielika: cel tego kroku jest widoczny."
          : feedback.assessment === "partial"
            ? "Według Bielika: cel jest częściowo widoczny."
            : "Według Bielika: ten fragment wymaga doprecyzowania."}
      </p>
      <h3>Fragment Twojej odpowiedzi</h3>
      <blockquote className="preserve-text">{feedback.quote}</blockquote>
      <h3>
        {feedback.assessment === "unclear"
          ? "Co Bielik zauważył"
          : "Co już działa"}
      </h3>
      <p>{feedback.strength}</p>
      <h3>Co możesz dopracować</h3>
      <p>{feedback.improvement}</p>
      <h3>Jedno pytanie do Ciebie</h3>
      <p>{feedback.nextQuestion}</p>
      <details className="review-source">
        <summary>Źródło tej wskazówki</summary>
        <p className="fine-print">
          Lokalny model: {review.llm.modelId}
          <br />
          {new Date(review.llm.generatedAt).toLocaleString("pl-PL")}
        </p>
      </details>
    </div>
  );
}

export function GuidedHistory({ reviews }: { reviews: GuidedReview[] }) {
  if (!reviews.length) return null;
  return (
    <section className="guided-history" aria-label="Poprzednie kroki ćwiczenia">
      <h2>Twoje wcześniejsze kroki</h2>
      {reviews.map((review) => (
        <details key={review.eventId}>
          <summary>
            Krok {review.step + 1}: {GUIDED_STEPS[review.step].title}
          </summary>
          <p className="preserve-text guided-answer">{review.answer}</p>
          <details>
            <summary>Wskazówka Bielika do tego kroku</summary>
            <ReviewContent review={review} />
          </details>
        </details>
      ))}
    </section>
  );
}
