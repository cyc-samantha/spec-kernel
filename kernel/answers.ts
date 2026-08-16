import type { MissingItem } from './seal-check.ts';
import type { Entitlement } from './rules.ts';
import type { ProjectDeclaration } from '../ports/project.ts';

export interface SlotAnswer {
  slot: string;
  value: unknown;
  answeredBy: string;
  entitlement: Entitlement;
  source: 'human' | 'derived';
}

export interface AnswerInput {
  value: unknown;
  answeredBy: string;
}

export type AnswerRecordResult =
  | { kind: 'recorded'; history: readonly SlotAnswer[] }
  | {
      kind: 'handoff';
      history: readonly SlotAnswer[];
      slot: string;
      required: Entitlement;
      answeredBy: string;
    }
  | { kind: 'refused'; history: readonly SlotAnswer[]; slot: string; reason: string };

function entitled(
  identity: string,
  entitlement: Entitlement,
  project: ProjectDeclaration,
): boolean {
  return project.slot_entitlements[entitlement].includes(identity);
}

/**
 * Adds an answer without mutating history. An identity mismatch is routing
 * information, not content that can fill the slot.
 */
export function recordAnswer(
  history: readonly SlotAnswer[],
  missing: Pick<MissingItem, 'slot' | 'entitlement'>,
  input: AnswerInput,
  project: ProjectDeclaration,
): AnswerRecordResult {
  if (!input.answeredBy.trim() || input.value === undefined) {
    return {
      kind: 'refused',
      history,
      slot: missing.slot,
      reason: 'an answer needs a named author and an explicit value',
    };
  }

  const requesterAuthored = history.some(
    (answer) => answer.slot === missing.slot && answer.entitlement === 'requester',
  );
  if (
    !entitled(input.answeredBy, missing.entitlement, project)
    || (requesterAuthored && missing.entitlement !== 'requester')
  ) {
    return {
      kind: 'handoff',
      history,
      slot: missing.slot,
      required: missing.entitlement,
      answeredBy: input.answeredBy,
    };
  }

  return {
    kind: 'recorded',
    history: [
      ...history,
      {
        slot: missing.slot,
        value: input.value,
        answeredBy: input.answeredBy,
        entitlement: missing.entitlement,
        source: 'human',
      },
    ],
  };
}

/*
 * A derived value has no human author and claims none. Routing it through
 * entitlement would be a lie: nobody decided it, so nobody can be asked to
 * stand behind it.
 */
export function recordDerivation(
  history: readonly SlotAnswer[],
  missing: Pick<MissingItem, 'slot' | 'entitlement'>,
  value: unknown,
): readonly SlotAnswer[] {
  return [
    ...history,
    { slot: missing.slot, value, answeredBy: 'derivation', entitlement: missing.entitlement, source: 'derived' },
  ];
}

export type InterviewState =
  | { status: 'sealed'; successful: true }
  | { status: 'awaiting_technical_completion'; successful: true }
  | { status: 'in_progress'; successful: false };

/** Requester-led collection succeeds when nothing requester-owned remains to ask. */
export function interviewState(
  missing: readonly Pick<MissingItem, 'entitlement'>[],
): InterviewState {
  if (missing.length === 0) return { status: 'sealed', successful: true };
  if (missing.every((item) => item.entitlement === 'technical_author')) {
    return { status: 'awaiting_technical_completion', successful: true };
  }
  return { status: 'in_progress', successful: false };
}
