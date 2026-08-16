import { z } from 'zod';

import type { MissingItem } from '../kernel/seal-check.ts';
import type { ParentIntent } from '../kernel/split.ts';

const nonBlank = z.string().trim().min(1);

export const conversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: nonBlank,
}).strict();

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

/*
 * Each gap carries its own value schema, so the translator is never asked to
 * locate the right fragment of a whole-document schema before it can answer.
 */
export interface ModelRequest {
  messages: readonly ConversationMessage[];
  draft: unknown;
  focus: MissingItem;
  missing: readonly MissingItem[];
  proposals: readonly PendingProposal[];
}

/** Machine drafts already shown to the requester but not yet confirmed. */
export interface PendingProposal {
  ruleId: string;
  slot: string;
  value: unknown;
  reason: string;
}

/**
 * A model returns a value for exactly the Rule-derived gap it was given.
 * The application boundary applies and checks it; the model never returns a
 * seal verdict.
 */
const answerSchema = z.object({
  ruleId: nonBlank,
  slot: nonBlank,
  value: z.unknown().refine((value) => value !== undefined, 'an answer needs a value'),
}).strict();

/*
 * A value the human has not agreed to yet. It carries a reason because a value
 * whose grounds a person cannot see is not something they can confirm — they
 * can only rubber-stamp it.
 */
const draftedValueSchema = answerSchema.extend({ reason: nonBlank });

function duplicated(entries: readonly { ruleId: string; slot: string }[]): boolean {
  const keys = entries.map((entry) => `${entry.ruleId}\u0000${entry.slot}`);
  return new Set(keys).size !== keys.length;
}

export const modelProposalSchema = z.object({
  // Accepted during migration from the original narrator-shaped port. The
  // application deliberately ignores it; progress comes from its ledger.
  assistantMessage: nonBlank.optional(),
  answers: z.array(answerSchema).max(4),
  proposals: z.array(draftedValueSchema).max(4).default([]),
}).strict().superRefine((proposal, context) => {
  if (duplicated(proposal.answers)) {
    context.addIssue({ code: 'custom', path: ['answers'], message: 'answers must be unique' });
  }
  if (duplicated(proposal.proposals)) {
    context.addIssue({ code: 'custom', path: ['proposals'], message: 'proposals must be unique' });
  }
});

export type ModelProposal = z.infer<typeof modelProposalSchema>;

export type ModelProposalLoad =
  | { ok: true; proposal: ModelProposal }
  | { ok: false; reason: string };

/** The only model capability the application layer consumes. */
export interface ModelPort {
  complete(request: ModelRequest): Promise<unknown>;
}

/*
 * Splitting is a separate capability, not a bigger ModelPort: a deployment that
 * only ever elicits one bounded change should not have to implement it, and the
 * verdict it returns is adjudicated by kernel/split.ts either way.
 */
export interface SplitRequest {
  intent: ParentIntent;
}

export interface SplitPort {
  splitIntent(request: SplitRequest): Promise<unknown>;
}

export type ModelPortFailure = 'unavailable' | 'invalid_response' | 'timed_out' | 'context_exceeded';

export class ModelPortError extends Error {
  readonly failure: ModelPortFailure;

  constructor(failure: ModelPortFailure, message: string) {
    super(message);
    this.name = 'ModelPortError';
    this.failure = failure;
  }
}

/** Validates an untrusted adapter response without allowing parse errors through. */
export function loadModelProposal(value: unknown): ModelProposalLoad {
  try {
    const parsed = modelProposalSchema.safeParse(value);
    if (parsed.success) return { ok: true, proposal: parsed.data };
    return { ok: false, reason: 'the model response did not match the proposal schema' };
  } catch {
    return { ok: false, reason: 'the model response could not be evaluated' };
  }
}
