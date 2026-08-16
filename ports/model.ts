import { z } from 'zod';

import type { MissingItem } from '../kernel/seal-check.ts';

const nonBlank = z.string().trim().min(1);

export const conversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: nonBlank,
}).strict();

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export interface ModelRequest {
  messages: readonly ConversationMessage[];
  draft: unknown;
  missing: readonly MissingItem[];
  valueSchema: unknown;
}

/**
 * A model proposes a value for exactly the Rule-derived gap it was given.
 * The application boundary applies and checks it; the model never returns a
 * seal verdict.
 */
const proposedAnswerSchema = z.object({
  ruleId: nonBlank,
  slot: nonBlank,
  value: z.unknown().refine((value) => value !== undefined, 'a proposed answer needs a value'),
}).strict();

export const modelProposalSchema = z.object({
  assistantMessage: nonBlank,
  answers: z.array(proposedAnswerSchema).max(64),
}).strict().superRefine((proposal, context) => {
  const keys = proposal.answers.map((answer) => `${answer.ruleId}\u0000${answer.slot}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', path: ['answers'], message: 'proposed answers must be unique' });
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

export type ModelPortFailure = 'unavailable' | 'invalid_response' | 'timed_out';

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
