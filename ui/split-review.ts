import { parentIntentFrom, validateSplitProposal, type ProposedContract } from '../kernel/split.ts';
import type { SplitPort } from '../ports/model.ts';
import { modelRefusalReason } from './model-refusal.ts';

export type SplitReview =
  | { status: 'split'; because: string; contracts: readonly ProposedContract[] }
  | { status: 'whole'; because: string }
  | { status: 'refused'; reason: string; problems: readonly string[] };

function refused(reason: string, problems: readonly string[] = []): SplitReview {
  return { status: 'refused', reason, problems };
}

/**
 * Divides a sealed specification into contracts an Agent team can claim. The
 * model suggests the division and the kernel admits it: a contract that drops a
 * criterion, duplicates one, or does not trace to the parent is refused, never
 * repaired (D22).
 */
export async function proposeSplit(
  specification: unknown,
  authoredBy: string,
  model: SplitPort,
): Promise<SplitReview> {
  const parent = parentIntentFrom(specification, authoredBy);
  if (!parent.ok) return refused('the document is not a sealed specification', parent.problems);

  let raw: unknown;
  try {
    raw = await model.splitIntent({ intent: parent.intent });
  } catch (error) {
    return refused(modelRefusalReason(error, 'sealed intent'));
  }

  const validated = validateSplitProposal(parent.intent, raw);
  if (!validated.ok) return refused('the proposed division does not carry the sealed work', validated.problems);
  if (validated.proposal.verdict === 'keep') return { status: 'whole', because: validated.proposal.because };
  return {
    status: 'split',
    because: validated.proposal.because,
    contracts: validated.proposal.contracts,
  };
}
