import { recordAnswer, type SlotAnswer } from '../kernel/answers.ts';
import { advanceInterview, type InterviewAttempt } from '../kernel/interview.ts';
import { sealCheck, type MissingItem } from '../kernel/seal-check.ts';
import type { Entitlement } from '../kernel/rules.ts';
import type { ProjectDeclaration } from '../ports/project.ts';
import {
  conversationMessageSchema,
  loadModelProposal,
  ModelPortError,
  type ConversationMessage,
  type ModelPort,
} from '../ports/model.ts';

export interface ConversationState {
  draft: unknown;
  messages: readonly ConversationMessage[];
  attempts: readonly InterviewAttempt[];
  answers: readonly SlotAnswer[];
}

export type ConversationResult =
  | { status: 'ask'; state: ConversationState; missing: MissingItem; prompt: string }
  | { status: 'sealed'; state: ConversationState; specification: unknown }
  | { status: 'awaiting_handoff'; state: ConversationState; missing: readonly MissingItem[] }
  | { status: 'blocking_decision'; state: ConversationState; decision: unknown }
  | { status: 'refused'; state: ConversationState; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function segmentIndex(container: unknown, segment: string): string | number | undefined {
  if (!Array.isArray(container)) return segment;
  if (/^\d+$/.test(segment)) return Number(segment);
  const index = container.findIndex((item) => isRecord(item) && item['id'] === segment);
  return index < 0 ? undefined : index;
}

function setSlot(draft: unknown, slot: string, value: unknown): unknown | undefined {
  let cloned: unknown;
  try {
    cloned = structuredClone(draft);
  } catch {
    return undefined;
  }
  if (!isRecord(cloned) || slot === '*' || slot === '(root)') return undefined;

  const segments = slot.split('.');
  let cursor: unknown = cloned;
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (!isRecord(cursor) && !Array.isArray(cursor)) return undefined;
    const key = segmentIndex(cursor, segments[index]!);
    if (key === undefined) return undefined;
    cursor = cursor[key as keyof typeof cursor];
  }
  if (!isRecord(cursor) && !Array.isArray(cursor)) return undefined;
  const final = segmentIndex(cursor, segments.at(-1)!);
  if (final === undefined) return undefined;
  cursor[final as keyof typeof cursor] = value as never;
  return cloned;
}

function applyAnswer(draft: unknown, missing: MissingItem, value: unknown): unknown | undefined {
  if (missing.ruleId !== 'human-criteria-covered') return setSlot(draft, missing.slot, value);
  let cloned: unknown;
  try {
    cloned = structuredClone(draft);
  } catch {
    return undefined;
  }
  if (!isRecord(cloned) || !Array.isArray(cloned['acceptance']) || !isRecord(value)) return undefined;
  cloned['acceptance'].push(value);
  return cloned;
}

function entitledRoles(identity: string, project: ProjectDeclaration): Entitlement[] {
  return (['requester', 'technical_author'] as const).filter((role) =>
    project.slot_entitlements[role].includes(identity),
  );
}

function eligibleMissing(draft: unknown, project: ProjectDeclaration, identity: string): MissingItem[] {
  const roles = entitledRoles(identity, project);
  return sealCheck(draft).filter((missing) => roles.includes(missing.entitlement));
}

function nextStep(
  state: ConversationState,
  project: ProjectDeclaration,
  identity: string,
): ReturnType<typeof advanceInterview> {
  const missing = sealCheck(state.draft);
  const roles = entitledRoles(identity, project);
  const role = roles.find((candidate) => missing.some((item) => item.entitlement === candidate));
  if (role) return advanceInterview(state.draft, project, state.attempts, role);
  if (missing.length === 0) return advanceInterview(state.draft, project, state.attempts);
  return { status: 'awaiting_technical_completion', successful: true, missing };
}

function withAssistant(state: ConversationState, content: string): ConversationState {
  return { ...state, messages: [...state.messages, { role: 'assistant', content }] };
}

function terminalResult(
  step: ReturnType<typeof advanceInterview>,
  state: ConversationState,
  modelMessage: string,
): ConversationResult | undefined {
  if (step.status === 'sealed') {
    const reply = modelMessage
      ? `${modelMessage}\n\nThe deterministic seal-check now has zero gaps.`
      : 'The deterministic seal-check has zero gaps.';
    return { status: 'sealed', state: withAssistant(state, reply), specification: step.specification };
  }
  if (step.status === 'awaiting_technical_completion') {
    return {
      status: 'awaiting_handoff',
      state: withAssistant(state, 'Requester intake is complete. The remaining answers need an entitled technical author.'),
      missing: step.missing,
    };
  }
  if (step.status === 'blocking_decision') {
    return {
      status: 'blocking_decision',
      state: withAssistant(state, 'This question is now a blocking decision because two attempts added no new information.'),
      decision: step.decision,
    };
  }
  if (step.status === 'refused') return { status: 'refused', state, reason: step.reason };
  return undefined;
}

/**
 * Translates one human turn into candidate answers for current Rule-derived
 * gaps. Every candidate is matched, entitlement-checked, applied in isolation,
 * and rerun through seal-check before it becomes an answer.
 */
export async function converse(
  state: ConversationState,
  project: ProjectDeclaration,
  identity: string,
  userMessage: string,
  model: ModelPort,
): Promise<ConversationResult> {
  const parsedMessage = conversationMessageSchema.safeParse({ role: 'user', content: userMessage });
  if (!parsedMessage.success) return { status: 'refused', state, reason: 'a conversation turn needs a non-blank user message' };
  let current: ConversationState = { ...state, messages: [...state.messages, parsedMessage.data] };
  const initialStep = nextStep(current, project, identity);
  const initialTerminal = terminalResult(initialStep, current, '');
  if (initialTerminal) return initialTerminal;
  if (initialStep.status !== 'ask') {
    return { status: 'refused', state: current, reason: 'the current Rule question could not be selected' };
  }
  const offered = eligibleMissing(current.draft, project, identity);

  let raw: unknown;
  try {
    raw = await model.complete({ messages: current.messages, draft: current.draft, missing: offered });
  } catch (error) {
    const reason = error instanceof ModelPortError && error.failure === 'invalid_response'
      ? 'the configured model returned an invalid response'
      : error instanceof ModelPortError && error.failure === 'timed_out'
        ? 'the configured model request timed out'
        : 'the configured model is unavailable';
    return { status: 'refused', state: current, reason };
  }
  const loaded = loadModelProposal(raw);
  if (!loaded.ok) return { status: 'refused', state: current, reason: loaded.reason };

  const offeredByKey = new Map(offered.map((missing) => [`${missing.ruleId}\u0000${missing.slot}`, missing]));
  for (const answer of loaded.proposal.answers) {
    if (!offeredByKey.has(`${answer.ruleId}\u0000${answer.slot}`)) {
      return { status: 'refused', state: current, reason: 'the model proposed an answer outside the offered Rule gaps' };
    }
  }

  for (const answer of loaded.proposal.answers) {
    const missing = offeredByKey.get(`${answer.ruleId}\u0000${answer.slot}`)!;
    const candidate = applyAnswer(current.draft, missing, answer.value);
    if (candidate === undefined) continue;
    const unresolved = sealCheck(candidate).some(
      (item) => item.ruleId === missing.ruleId && item.slot === missing.slot,
    );
    if (unresolved) continue;
    const recorded = recordAnswer(current.answers, missing, {
      value: answer.value,
      answeredBy: identity,
    }, project);
    if (recorded.kind !== 'recorded') continue;
    current = { ...current, draft: candidate, answers: recorded.history };
  }

  const currentGapResolved = !sealCheck(current.draft).some(
    (item) => item.ruleId === initialStep.missing.ruleId && item.slot === initialStep.missing.slot,
  );
  current = {
    ...current,
    attempts: [...current.attempts, {
      ruleId: initialStep.missing.ruleId,
      slot: initialStep.missing.slot,
      wording: initialStep.prompt,
      yieldedNewInformation: currentGapResolved,
    }],
  };

  const step = nextStep(current, project, identity);
  const terminal = terminalResult(step, current, loaded.proposal.assistantMessage);
  if (terminal) return terminal;
  if (step.status !== 'ask') {
    return { status: 'refused', state: current, reason: 'the next Rule question could not be selected' };
  }
  return {
    status: 'ask',
    state: withAssistant(current, `${loaded.proposal.assistantMessage}\n\n${step.prompt}`),
    missing: step.missing,
    prompt: step.prompt,
  };
}
