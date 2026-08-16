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

const MAX_PROPOSALS_PER_TURN = 32;

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
    const segment = segments[index]!;
    const key = segmentIndex(cursor, segment);
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

function withAssistant(
  state: ConversationState,
  content: string,
): ConversationState {
  return { ...state, messages: [...state.messages, { role: 'assistant', content }] };
}

/**
 * Translates one human turn into answers, one Rule-derived gap at a time. Each
 * proposed value is entitlement-checked and rerun through seal-check.
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
  let current: ConversationState = {
    ...state,
    messages: [...state.messages, parsedMessage.data],
  };
  let lastModelMessage = '';

  for (let count = 0; count < MAX_PROPOSALS_PER_TURN; count += 1) {
    const step = nextStep(current, project, identity);
    if (step.status === 'sealed') {
      const reply = lastModelMessage
        ? `${lastModelMessage}\n\nThe deterministic seal-check now has zero gaps.`
        : 'The deterministic seal-check has zero gaps.';
      return { status: 'sealed', state: withAssistant(current, reply), specification: step.specification };
    }
    if (step.status === 'awaiting_technical_completion') {
      return {
        status: 'awaiting_handoff',
        state: withAssistant(current, 'Requester intake is complete. The remaining answers need an entitled technical author.'),
        missing: step.missing,
      };
    }
    if (step.status === 'blocking_decision') {
      return {
        status: 'blocking_decision',
        state: withAssistant(current, 'This question is now a blocking decision because two attempts added no new information.'),
        decision: step.decision,
      };
    }
    if (step.status === 'refused') return { status: 'refused', state: current, reason: step.reason };

    let raw: unknown;
    try {
      raw = await model.complete({ messages: current.messages, draft: current.draft, missing: step.missing });
    } catch (error) {
      const reason = error instanceof ModelPortError && error.failure === 'invalid_response'
        ? 'the configured model returned an invalid response'
        : 'the configured model is unavailable';
      return { status: 'refused', state: current, reason };
    }
    const loaded = loadModelProposal(raw);
    if (!loaded.ok) return { status: 'refused', state: current, reason: loaded.reason };
    lastModelMessage = loaded.proposal.assistantMessage;

    if (!loaded.proposal.answered) {
      const attempts = [...current.attempts, {
        ruleId: step.missing.ruleId,
        slot: step.missing.slot,
        wording: step.prompt,
        yieldedNewInformation: false,
      }];
      current = { ...current, attempts };
      const repeated = nextStep(current, project, identity);
      if (repeated.status === 'blocking_decision') {
        return {
          status: 'blocking_decision',
          state: withAssistant(current, lastModelMessage),
          decision: repeated.decision,
        };
      }
      if (repeated.status !== 'ask') return { status: 'refused', state: current, reason: 'the next question could not be selected' };
      return {
        status: 'ask',
        state: withAssistant(current, `${lastModelMessage}\n\n${repeated.prompt}`),
        missing: repeated.missing,
        prompt: repeated.prompt,
      };
    }

    const recorded = recordAnswer(current.answers, step.missing, {
      value: loaded.proposal.value,
      answeredBy: identity,
    }, project);
    if (recorded.kind === 'handoff') {
      return { status: 'awaiting_handoff', state: current, missing: [step.missing] };
    }
    if (recorded.kind === 'refused') return { status: 'refused', state: current, reason: recorded.reason };

    const nextDraft = applyAnswer(current.draft, step.missing, loaded.proposal.value);
    if (nextDraft === undefined) return { status: 'refused', state: current, reason: 'the proposed answer could not be applied safely' };
    const stillMissing = sealCheck(nextDraft).some(
      (item) => item.ruleId === step.missing.ruleId && item.slot === step.missing.slot,
    );
    current = {
      ...current,
      draft: nextDraft,
      answers: recorded.history,
      attempts: [...current.attempts, {
        ruleId: step.missing.ruleId,
        slot: step.missing.slot,
        wording: step.prompt,
        yieldedNewInformation: !stillMissing,
      }],
    };
    if (stillMissing) {
      const repeated = nextStep(current, project, identity);
      if (repeated.status !== 'ask') return { status: 'refused', state: current, reason: 'the answer did not produce an evaluable next step' };
      return {
        status: 'ask',
        state: withAssistant(current, `${lastModelMessage}\n\n${repeated.prompt}`),
        missing: repeated.missing,
        prompt: repeated.prompt,
      };
    }
  }

  return { status: 'refused', state: current, reason: 'one turn produced too many model proposals' };
}
