import { recordAnswer, recordDerivation, type SlotAnswer } from '../kernel/answers.ts';
import { deriveSlot, hasDerivation } from '../kernel/derivations.ts';
import { advanceInterview, type InterviewAttempt } from '../kernel/interview.ts';
import { sealCheck, type MissingItem } from '../kernel/seal-check.ts';
import type { Consequence, Entitlement, RuleId } from '../kernel/rules.ts';
import type { ProjectDeclaration } from '../ports/project.ts';
import { readConfirmation } from './confirmation.ts';
import { modelRefusalReason } from './model-refusal.ts';
import {
  conversationMessageSchema,
  loadModelProposal,
  type ConversationMessage,
  type ModelPort,
} from '../ports/model.ts';

/*
 * A value a machine drafted and no person has agreed to. It is deliberately
 * held beside the draft rather than inside it: a draft that carried unconfirmed
 * values would let one seal-check pass on content nobody authored (D8).
 */
export interface SlotProposal {
  ruleId: RuleId;
  slot: string;
  question: string;
  value: unknown;
  reason: string;
  consequence: Consequence;
  entitlement: Entitlement;
}

export interface ConversationState {
  draft: unknown;
  messages: readonly ConversationMessage[];
  attempts: readonly InterviewAttempt[];
  answers: readonly SlotAnswer[];
  proposals: readonly SlotProposal[];
}

export type ConversationResult =
  | {
      status: 'ask';
      state: ConversationState;
      missing: MissingItem;
      prompt: string;
      proposals: readonly SlotProposal[];
    }
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

function gapKey(gap: { ruleId: string; slot: string }): string {
  return `${gap.ruleId}\u0000${gap.slot}`;
}

function namesSlot(message: string, slot: string): boolean {
  const topLevel = slot.split('.')[0]!;
  const words = topLevel.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const normalized = message.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return ` ${normalized.trim()} `.includes(` ${words} `);
}

/** An explicit correction to a standing draft outranks the otherwise next Rule. */
function modelFocus(
  message: string,
  proposals: readonly SlotProposal[],
  offered: ReadonlyMap<string, MissingItem>,
  fallback: MissingItem,
): MissingItem {
  const named = proposals.find((proposal) => namesSlot(message, proposal.slot));
  return named ? offered.get(gapKey(named)) ?? fallback : fallback;
}

/** A candidate only counts when the rule that reported the gap now admits it. */
function resolves(draft: unknown, missing: MissingItem, value: unknown): unknown | undefined {
  const candidate = applyAnswer(draft, missing, value);
  if (candidate === undefined) return undefined;
  const stillMissing = sealCheck(candidate).some(
    (item) => item.ruleId === missing.ruleId && item.slot === missing.slot,
  );
  return stillMissing ? undefined : candidate;
}

function entitledRoles(identity: string, project: ProjectDeclaration): Entitlement[] {
  return (['requester', 'technical_author'] as const).filter((role) =>
    project.slot_entitlements[role].includes(identity),
  );
}

/*
 * Slots with a derivation are withheld from the translator. Their one correct
 * value follows from what is already declared, so a guess can only be wrong.
 */
function eligibleMissing(draft: unknown, project: ProjectDeclaration, identity: string): MissingItem[] {
  const roles = entitledRoles(identity, project);
  return sealCheck(draft).filter(
    (missing) => roles.includes(missing.entitlement) && !hasDerivation(missing.slot),
  );
}

function deriveOnce(state: ConversationState, project: ProjectDeclaration): ConversationState | undefined {
  for (const missing of sealCheck(state.draft)) {
    const derivation = deriveSlot(missing.slot, state.draft, project);
    if (!derivation.ok) continue;
    const candidate = resolves(state.draft, missing, derivation.value);
    if (candidate === undefined) continue;
    return { ...state, draft: candidate, answers: recordDerivation(state.answers, missing, derivation.value) };
  }
  return undefined;
}

/** Fills every slot no person should be asked about, including ones a new answer unlocks. */
function withDerivations(state: ConversationState, project: ProjectDeclaration): ConversationState {
  let current = state;
  for (let pass = 0; pass < sealCheck(current.draft).length + 1; pass += 1) {
    const advanced = deriveOnce(current, project);
    if (!advanced) return current;
    current = advanced;
  }
  return current;
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

function applyModelAnswers(
  state: ConversationState,
  offered: Map<string, MissingItem>,
  answers: readonly { ruleId: string; slot: string; value: unknown }[],
  identity: string,
  project: ProjectDeclaration,
): ConversationState {
  let current = state;
  for (const answer of answers) {
    const missing = offered.get(gapKey(answer))!;
    const candidate = resolves(current.draft, missing, answer.value);
    if (candidate === undefined) continue;
    const recorded = recordAnswer(current.answers, missing, { value: answer.value, answeredBy: identity }, project);
    if (recorded.kind !== 'recorded') continue;
    current = { ...current, draft: candidate, answers: recorded.history };
  }
  return current;
}

/*
 * A drafted value is kept only if the rule that reported the gap would accept
 * it. An unusable draft is worse than none: it invites a confirmation that
 * changes nothing and costs the reviewer their attention.
 */
function keepUsableProposals(
  state: ConversationState,
  proposals: readonly { ruleId: string; slot: string; value: unknown; reason: string }[],
): readonly SlotProposal[] {
  const open = new Map(sealCheck(state.draft).map((missing) => [gapKey(missing), missing]));
  return proposals.flatMap((proposal) => {
    const missing = open.get(gapKey(proposal));
    if (!missing || resolves(state.draft, missing, proposal.value) === undefined) return [];
    return [{
      ruleId: missing.ruleId,
      slot: missing.slot,
      question: missing.question,
      value: proposal.value,
      reason: proposal.reason,
      consequence: missing.consequence,
      entitlement: missing.entitlement,
    }];
  });
}

/**
 * A model turn may update a standing draft, but silence about another draft
 * must not erase something the requester is still being asked to review.
 */
function mergeUsableProposals(
  state: ConversationState,
  previous: readonly SlotProposal[],
  incoming: readonly { ruleId: string; slot: string; value: unknown; reason: string }[],
): readonly SlotProposal[] {
  const merged = new Map<string, { ruleId: string; slot: string; value: unknown; reason: string }>(
    previous.map((proposal) => [gapKey(proposal), proposal]),
  );
  for (const proposal of incoming) merged.set(gapKey(proposal), proposal);
  return keepUsableProposals(state, [...merged.values()]);
}

/*
 * A draft the requester has not seen before moves its gap forward: a value now
 * exists for them to accept. Re-offering the same draft does not, or an ignored
 * suggestion would keep an interview alive that is going nowhere (D10).
 */
function movedForward(
  state: ConversationState,
  asked: MissingItem,
  proposalsBefore: readonly SlotProposal[],
  answerCountBefore: number,
  recognizedCorrection: boolean,
): boolean {
  // One inference may extract several offered gaps. Information supplied out
  // of Rule order still advances the specification and must not count as a
  // stalled answer to whichever gap happened to be displayed.
  if (recognizedCorrection || state.answers.length > answerCountBefore) return true;
  const key = gapKey(asked);
  if (!sealCheck(state.draft).some((item) => gapKey(item) === key)) return true;
  const prior = new Map(proposalsBefore.map((proposal) => [gapKey(proposal), proposal]));
  return state.proposals.some((proposal) => !sameProposal(prior.get(gapKey(proposal)), proposal));
}

function withAttempt(
  state: ConversationState,
  asked: MissingItem,
  prompt: string,
  proposalsBefore: readonly SlotProposal[],
  answerCountBefore: number,
  recognizedCorrection = false,
): ConversationState {
  const attempt = {
    ruleId: asked.ruleId,
    slot: asked.slot,
    wording: prompt,
    yieldedNewInformation: movedForward(
      state,
      asked,
      proposalsBefore,
      answerCountBefore,
      recognizedCorrection,
    ),
  };
  return { ...state, attempts: [...state.attempts, attempt] };
}

/*
 * A gap with a draft on offer is asked as a confirmation. Re-asking the bare
 * question — or worse, complaining it went unanswered — argues with a value the
 * machine is already showing the requester.
 */
function promptFor(
  state: ConversationState,
  step: Extract<ReturnType<typeof advanceInterview>, { status: 'ask' }>,
): string {
  const drafted = state.proposals.some((proposal) => gapKey(proposal) === gapKey(step.missing));
  if (!drafted) return step.prompt;
  return `I drafted an answer for this. Confirm it above, or correct me here. ${step.missing.question}`;
}

/*
 * Saying a turn failed is only useful beside a way out of it. Both routes named
 * here are ones the requester can take by typing, because that is now the only
 * thing they have.
 */
function untranslated(slot: string): string {
  return `I could not turn that into ${slot}. The draft above is still my earlier guess — say "confirm ${slot}" to take it as it stands, or say the value again in one line.`;
}

/*
 * A grant of authority nobody read is a grant the machine made itself (D14).
 * Agreement is enough for a routine draft; this one has to be said by name.
 */
function authorityNaming(slots: readonly string[]): string {
  return `${slots.join(', ')} decides what an Agent may do unsupervised, so I cannot take a general yes for it. Say "confirm ${slots[0]}" to grant it, or tell me what it should say instead.`;
}

function askResult(
  state: ConversationState,
  step: Extract<ReturnType<typeof advanceInterview>, { status: 'ask' }>,
  progressMessage: string,
): ConversationResult {
  const prompt = promptFor(state, step);
  return {
    status: 'ask',
    state: withAssistant(state, [progressMessage, prompt].filter(Boolean).join('\n\n')),
    missing: step.missing,
    prompt,
    proposals: state.proposals,
  };
}

function sameProposal(left: SlotProposal | undefined, right: SlotProposal): boolean {
  return left !== undefined
    && left.reason === right.reason
    && JSON.stringify(left.value) === JSON.stringify(right.value);
}

/*
 * An answer identical to a standing draft is the model rubber-stamping itself,
 * and only a person may accept a draft (D8). A different value is content the
 * human supplied, and what a human states outranks what a machine drafted for
 * the same slot — discarding it leaves the machine's guess in its place.
 */
function humanSuppliedAnswers(
  pending: ReadonlyMap<string, SlotProposal>,
  answers: readonly { ruleId: string; slot: string; value: unknown }[],
): readonly { ruleId: string; slot: string; value: unknown }[] {
  return answers.filter((answer) => {
    const drafted = pending.get(gapKey(answer));
    return !drafted || JSON.stringify(drafted.value) !== JSON.stringify(answer.value);
  });
}

/** The ledger narrates progress; model prose cannot claim writes that did not happen. */
function progressMessage(
  beforeAnswerCount: number,
  beforeProposals: readonly SlotProposal[],
  state: ConversationState,
): string {
  const recorded = state.answers.slice(beforeAnswerCount);
  const human = recorded.filter((answer) => answer.source === 'human').map((answer) => answer.slot);
  const derived = recorded.filter((answer) => answer.source === 'derived').map((answer) => answer.slot);
  const prior = new Map(beforeProposals.map((proposal) => [gapKey(proposal), proposal]));
  const drafted = state.proposals
    .filter((proposal) => !sameProposal(prior.get(gapKey(proposal)), proposal))
    .map((proposal) => proposal.slot);
  return [
    human.length > 0 ? `I recorded ${human.join(', ')}.` : '',
    derived.length > 0 ? `I derived ${derived.join(', ')}.` : '',
    drafted.length > 0 ? `Drafts awaiting your confirmation: ${drafted.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
}

/**
 * Translates one human turn into candidate answers for current Rule-derived
 * gaps, and collects machine drafts for the gaps the turn left open. Every
 * candidate is matched, entitlement-checked, applied in isolation, and rerun
 * through seal-check before it becomes an answer.
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
  const proposalsBefore = state.proposals;
  let current = withDerivations({ ...state, messages: [...state.messages, parsedMessage.data] }, project);
  const initialStep = nextStep(current, project, identity);
  const initialTerminal = terminalResult(initialStep, current, '');
  if (initialTerminal) return initialTerminal;
  if (initialStep.status !== 'ask') {
    return { status: 'refused', state: current, reason: 'the current Rule question could not be selected' };
  }
  const spoken = readConfirmation(userMessage, current.proposals);
  if (spoken.kind === 'confirms') return confirmProposals(current, project, identity, spoken.slots);
  if (spoken.kind === 'needs_naming') {
    return askResult(current, initialStep, authorityNaming(spoken.slots));
  }

  const offered = new Map(eligibleMissing(current.draft, project, identity).map((item) => [gapKey(item), item]));
  const beforeAnswerCount = current.answers.length;
  const focus = modelFocus(userMessage, current.proposals, offered, initialStep.missing);
  const isFocusedCorrection = gapKey(focus) !== gapKey(initialStep.missing);
  const correctionIsNew = isFocusedCorrection && !state.messages.some(
    (message) => message.role === 'user' && message.content === userMessage,
  );
  const presented = isFocusedCorrection
    ? new Map([[gapKey(focus), focus]])
    : offered;

  let raw: unknown;
  try {
    raw = await model.complete({
      messages: current.messages,
      draft: current.draft,
      focus,
      missing: [...presented.values()],
      drafted: current.proposals.map((proposal) => proposal.slot),
    });
  } catch (error) {
    return { status: 'refused', state: current, reason: modelRefusalReason(error, 'conversation') };
  }
  const loaded = loadModelProposal(raw);
  if (!loaded.ok) return { status: 'refused', state: current, reason: loaded.reason };
  /*
   * A candidate for a gap that was not offered is discarded, never honoured —
   * the model writes only where it was asked. Refusing the whole turn over one
   * would throw away the candidates that were in scope, and the requester's own
   * words with them, to punish a mistake only the model made.
   */
  const inScope = <T extends { ruleId: string; slot: string }>(items: readonly T[]): T[] =>
    items.filter((item) => presented.has(gapKey(item)));

  // A standing machine draft can become an answer only through the named,
  // deterministic confirmation route below. Letting the translator copy it
  // into answers would allow the model to approve its own proposal.
  const pending = new Map(current.proposals.map((proposal) => [gapKey(proposal), proposal]));
  const supplied = humanSuppliedAnswers(pending, inScope(loaded.proposal.answers));
  const applied = applyModelAnswers(current, presented, supplied, identity, project);
  current = withDerivations(applied, project);
  current = {
    ...current,
    proposals: mergeUsableProposals(current, state.proposals, inScope(loaded.proposal.proposals)),
  };
  current = withAttempt(
    current,
    initialStep.missing,
    initialStep.prompt,
    proposalsBefore,
    beforeAnswerCount,
    correctionIsNew,
  );
  const progress = progressMessage(beforeAnswerCount, state.proposals, current);
  const narration = progress || (correctionIsNew ? untranslated(focus.slot) : '');

  const step = nextStep(current, project, identity);
  const terminal = terminalResult(step, current, narration);
  if (terminal) return terminal;
  if (step.status !== 'ask') {
    return { status: 'refused', state: current, reason: 'the next Rule question could not be selected' };
  }
  return askResult(current, step, narration);
}

function confirmOne(
  state: ConversationState,
  proposal: SlotProposal,
  identity: string,
  project: ProjectDeclaration,
): ConversationState {
  const missing = sealCheck(state.draft).find((item) => gapKey(item) === gapKey(proposal));
  if (!missing) return state;
  const candidate = resolves(state.draft, missing, proposal.value);
  if (candidate === undefined) return state;
  const recorded = recordAnswer(state.answers, missing, { value: proposal.value, answeredBy: identity }, project);
  if (recorded.kind !== 'recorded') return state;
  return { ...state, draft: candidate, answers: recorded.history };
}

/**
 * Turns named machine drafts into human answers. The caller must name every
 * slot it accepts: there is no blanket confirmation, because a grant of
 * authority nobody read is a grant the machine made for itself (D14).
 */
export function confirmProposals(
  state: ConversationState,
  project: ProjectDeclaration,
  identity: string,
  slots: readonly string[],
): ConversationResult {
  const named = new Set(slots);
  const selected = state.proposals.filter((proposal) => named.has(proposal.slot));
  if (selected.length === 0) {
    return { status: 'refused', state, reason: 'a confirmation must name at least one drafted slot' };
  }
  let current = selected.reduce((carried, proposal) => confirmOne(carried, proposal, identity, project), state);
  const recorded = selected
    .filter((proposal) => !sealCheck(current.draft).some((item) => gapKey(item) === gapKey(proposal)))
    .map((proposal) => proposal.slot);
  const recordedSlots = new Set(recorded);
  current = withDerivations({
    ...current,
    proposals: state.proposals.filter((proposal) => !recordedSlots.has(proposal.slot)),
  }, project);
  // WHY: a fixed acknowledgement repeated across confirmations reads as a loop.
  // Naming the slots is how the requester sees the document actually moved.
  const message = recorded.length > 0
    ? `I recorded ${recorded.join(', ')}.`
    : 'I could not record any of the values you named.';

  const step = nextStep(current, project, identity);
  const terminal = terminalResult(step, current, message);
  if (terminal) return terminal;
  if (step.status !== 'ask') {
    return { status: 'refused', state: current, reason: 'the next Rule question could not be selected' };
  }
  return askResult(current, step, message);
}
