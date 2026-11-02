import type { AssistanceEvent, Attempt } from '../shared/schemas.js';
export function assistanceState(attempt: Pick<Attempt, 'assistanceTracking'>, events: AssistanceEvent[]): 'none_confirmed'|'assisted'|'unknown' {
  if (events.some(e => e.status === 'prepared')) return 'unknown';
  if (events.some(e => e.status === 'delivered')) return 'assisted';
  return attempt.assistanceTracking === 'known' ? 'none_confirmed' : 'unknown';
}
