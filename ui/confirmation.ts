import type { SlotProposal } from './conversation.ts';

/*
 * Accepting a draft is a human act, so it is read here rather than asked of the
 * model: a translator that could recognise its own approval would be approving
 * its own work (D8). Recognition is deliberately narrow — anything carrying
 * content falls through to the ordinary turn, where it can still be an answer.
 */
export type ConfirmationRead =
  | { kind: 'none' }
  | { kind: 'nothing_pending' }
  | { kind: 'confirms'; slots: readonly string[] }
  | { kind: 'needs_naming'; slots: readonly string[] };

const AGREEMENTS = new Set([
  'yes', 'y', 'yeah', 'yep', 'ok', 'okay', 'sure', 'correct', 'confirm',
  'confirmed', 'accept', 'accepted', 'agree', 'agreed', 'right', 'good', 'fine',
]);

const FILLERS = new Set([
  'the', 'that', 'this', 'it', 'is', 'are', 'all', 'them', 'both',
  'please', 'go', 'ahead', 'and', 'to', 'looks', 'sounds', 'thats',
]);

// A confirmation is a short act. Length alone is not the gate, but it keeps a
// long message from ever being read as one because of a stray "ok" inside it.
const MAX_WORDS = 8;

/*
 * Where one message stops being one act. A period is deliberately absent: `yes.
 * but change scope` must stay a single reading, or the first half would grant
 * the value the second half is replacing.
 */
const BETWEEN_ACTS = /[\n,;?!"']+/;

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

function slotWords(slot: string): string[] {
  return words(slot.replace(/([a-z])([A-Z])/g, '$1 $2'));
}

function namedIn(spoken: readonly string[], proposals: readonly SlotProposal[]): SlotProposal[] {
  return proposals.filter((proposal) => slotWords(proposal.slot).every((word) => spoken.includes(word)));
}

/** Agreement alone cannot reach a draft whose consequence is a grant of authority. */
function decide(candidates: readonly SlotProposal[], named: boolean): ConfirmationRead {
  const reachable = named ? candidates : candidates.filter((item) => item.consequence !== 'authority');
  if (reachable.length > 0) return { kind: 'confirms', slots: reachable.map((item) => item.slot) };
  if (candidates.length === 0) return { kind: 'nothing_pending' };
  return { kind: 'needs_naming', slots: candidates.map((item) => item.slot) };
}

type SegmentRead = { agrees: false } | { agrees: true; named: readonly SlotProposal[] };

/** Agreement in one uninterrupted act, and the standing drafts it named. */
function readSegment(segment: string, proposals: readonly SlotProposal[]): SegmentRead {
  const spoken = words(segment);
  if (spoken.length === 0 || spoken.length > MAX_WORDS) return { agrees: false };
  const named = namedIn(spoken, proposals);
  const slotNames = new Set(named.flatMap((proposal) => slotWords(proposal.slot)));
  const rest = spoken.filter((word) => !slotNames.has(word));
  if (!rest.some((word) => AGREEMENTS.has(word))) return { agrees: false };
  if (!rest.every((word) => AGREEMENTS.has(word) || FILLERS.has(word))) return { agrees: false };
  return { agrees: true, named };
}

/*
 * A person writes one message, not one act: the turn that deadlocked carried a
 * question and `"confirm irreversibility", "confirm risk"` together. Naming the
 * slot is what lets a grant survive its surroundings — a segment that agrees
 * without naming anything contributes nothing, so a bare "yes" still needs the
 * whole message to be short.
 */
function namedGrants(message: string, proposals: readonly SlotProposal[]): string[] {
  const granted = message.split(BETWEEN_ACTS).flatMap((segment) => {
    const read = readSegment(segment, proposals);
    return read.agrees ? read.named.map((proposal) => proposal.slot) : [];
  });
  return [...new Set(granted)];
}

/** Reads agreement, and only agreement, out of one typed message. */
export function readConfirmation(message: string, proposals: readonly SlotProposal[]): ConfirmationRead {
  const whole = readSegment(message, proposals);
  if (whole.agrees) return decide(whole.named.length > 0 ? whole.named : proposals, whole.named.length > 0);
  const granted = namedGrants(message, proposals);
  return granted.length > 0 ? { kind: 'confirms', slots: granted } : { kind: 'none' };
}
