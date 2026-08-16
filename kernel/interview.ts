import { interviewState } from './answers.ts';
import { sealCheck, type MissingItem } from './seal-check.ts';
import { specificationSchema, type Specification } from './specification.ts';
import type { Entitlement } from './rules.ts';
import type { ProjectDeclaration } from '../ports/project.ts';

export interface InterviewAttempt {
  ruleId: MissingItem['ruleId'];
  slot: string;
  wording: string;
  yieldedNewInformation: boolean;
}

export type InterviewStep =
  | { status: 'ask'; missing: MissingItem; prompt: string }
  | {
      status: 'blocking_decision';
      decision: { id: string; question: string; owner: string; deferred: false };
    }
  | { status: 'awaiting_technical_completion'; successful: true; missing: MissingItem[] }
  | { status: 'sealed'; successful: true; specification: Specification }
  | { status: 'refused'; reason: string };

function sameGap(attempt: InterviewAttempt, missing: MissingItem): boolean {
  return attempt.ruleId === missing.ruleId && attempt.slot === missing.slot;
}

function consecutiveStalls(attempts: readonly InterviewAttempt[], missing: MissingItem): number {
  let count = 0;
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!;
    if (!sameGap(attempt, missing)) continue;
    if (attempt.yieldedNewInformation) break;
    count += 1;
  }
  return count;
}

function decisionId(missing: MissingItem): string {
  const suffix = `${missing.ruleId}-${missing.slot}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `BD-${suffix}`;
}

/** Advances one question at a time; every prompt originates in a Rule object. */
export function advanceInterview(
  draft: unknown,
  project: ProjectDeclaration,
  attempts: readonly InterviewAttempt[] = [],
  answeringAs: Entitlement = 'requester',
): InterviewStep {
  const missing = sealCheck(draft);
  if (missing.some((item) => item.message.includes('could not be evaluated'))) {
    return { status: 'refused', reason: 'the draft could not be evaluated safely' };
  }

  if (missing.length === 0) {
    const parsed = specificationSchema.safeParse(draft);
    if (!parsed.success) return { status: 'refused', reason: 'the sealed draft does not parse' };
    return { status: 'sealed', successful: true, specification: parsed.data };
  }
  const next = missing.find((item) => item.entitlement === answeringAs);
  if (!next) {
    const state = interviewState(missing);
    if (state.status === 'awaiting_technical_completion') return { ...state, missing };
    return { status: 'refused', reason: 'no entitled next question could be selected' };
  }
  const stalls = consecutiveStalls(attempts, next);
  if (stalls >= 2) {
    return {
      status: 'blocking_decision',
      decision: {
        id: decisionId(next),
        question: next.question,
        owner: project.slot_entitlements[answeringAs][0]!,
        deferred: false,
      },
    };
  }

  const prefix = stalls === 1 ? 'That did not answer the question I asked. ' : '';
  return { status: 'ask', missing: next, prompt: `${prefix}${next.question}` };
}
