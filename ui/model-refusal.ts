import { ModelPortError } from '../ports/model.ts';

/*
 * What a requester should do next differs per failure: start the runtime, wait
 * and retry, or shorten the conversation. One mapping, so a new failure kind
 * cannot be honest in one surface and misleading in another.
 */
export function modelRefusalReason(error: unknown, overrunSubject: string): string {
  if (!(error instanceof ModelPortError)) return 'the configured model is unavailable';
  if (error.failure === 'invalid_response') return 'the configured model returned an invalid response';
  if (error.failure === 'timed_out') return 'the configured model request timed out';
  if (error.failure === 'context_exceeded') {
    return `the ${overrunSubject} outgrew the configured model context window`;
  }
  return 'the configured model is unavailable';
}
