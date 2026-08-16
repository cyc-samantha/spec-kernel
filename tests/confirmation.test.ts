import { describe, expect, it } from 'vitest';

import { readConfirmation } from '../ui/confirmation.ts';
import type { SlotProposal } from '../ui/conversation.ts';

function proposal(slot: string, consequence: SlotProposal['consequence'] = 'routine'): SlotProposal {
  return {
    ruleId: 'scope-bounded',
    slot,
    question: 'What is inside this change, and what is explicitly outside it?',
    value: { include: ['mapping logic'], exclude: [] },
    reason: 'drafted from the description',
    consequence,
    entitlement: 'requester',
  };
}

describe('reading a confirmation out of what a person typed', () => {
  it('accepts every routine draft on a bare agreement', () => {
    expect(readConfirmation('yes', [proposal('scope'), proposal('constraints')])).toEqual({
      kind: 'confirms',
      slots: ['scope', 'constraints'],
    });
  });

  it('accepts only the draft the message names', () => {
    expect(readConfirmation('confirm scope', [proposal('scope'), proposal('constraints')])).toEqual({
      kind: 'confirms',
      slots: ['scope'],
    });
  });

  /*
   * The gate's fail-closed line. A live turn read "scope should include columns
   * …" as material about scope; reading it as agreement with the standing draft
   * would record a value the person was in the middle of replacing.
   */
  it('refuses a message that carries content, even when it names a drafted slot', () => {
    const message = 'scope should include columns\nfirst name -- surname\nlast name -- forename';
    expect(readConfirmation(message, [proposal('scope')])).toEqual({ kind: 'none' });
  });

  it('refuses a short correction that names a slot without agreeing to it', () => {
    expect(readConfirmation('scope is wrong', [proposal('scope')])).toEqual({ kind: 'none' });
    expect(readConfirmation('yes but change scope', [proposal('scope')])).toEqual({ kind: 'none' });
  });

  /*
   * D14: a grant of authority nobody read is a grant the machine made itself.
   * Losing the tick box must not lose the reading.
   */
  it('withholds an authority draft from a bare agreement and asks for its name', () => {
    expect(readConfirmation('yes', [proposal('authority', 'authority')])).toEqual({
      kind: 'needs_naming',
      slots: ['authority'],
    });
  });

  it('accepts an authority draft the message names explicitly', () => {
    expect(readConfirmation('confirm authority', [proposal('authority', 'authority')])).toEqual({
      kind: 'confirms',
      slots: ['authority'],
    });
  });

  it('separates a routine draft it can accept from an authority draft it cannot', () => {
    expect(readConfirmation('ok', [proposal('scope'), proposal('authority', 'authority')])).toEqual({
      kind: 'confirms',
      slots: ['scope'],
    });
  });

  /** Unevaluable input: nothing to read it from. */
  it('refuses a blank message', () => {
    expect(readConfirmation('   ', [proposal('scope')])).toEqual({ kind: 'none' });
    expect(readConfirmation('!!!', [proposal('scope')])).toEqual({ kind: 'none' });
  });

  /*
   * Agreement with nothing standing is not an answer to the question on screen.
   * Reporting it as one spent an inference and a stall on a turn that held no
   * information either way.
   */
  it('separates agreement with nothing pending from a message that is not agreement', () => {
    expect(readConfirmation('yes', [])).toEqual({ kind: 'nothing_pending' });
    expect(readConfirmation('a data mapping tool', [])).toEqual({ kind: 'none' });
  });
});
