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
  missing: MissingItem;
}

/**
 * A model proposes a value for exactly the Rule-derived gap it was given.
 * The application boundary applies and checks it; the model never returns a
 * seal verdict.
 */
export const modelProposalSchema = z.discriminatedUnion('answered', [
  z.object({
    answered: z.literal(true),
    assistantMessage: nonBlank,
    value: z.unknown().refine((value) => value !== undefined, 'an answered proposal needs a value'),
  }).strict(),
  z.object({
    answered: z.literal(false),
    assistantMessage: nonBlank,
    value: z.never().optional(),
  }).strict(),
]);

export type ModelProposal = z.infer<typeof modelProposalSchema>;

export type ModelProposalLoad =
  | { ok: true; proposal: ModelProposal }
  | { ok: false; reason: string };

/** The only model capability the application layer consumes. */
export interface ModelPort {
  complete(request: ModelRequest): Promise<unknown>;
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
