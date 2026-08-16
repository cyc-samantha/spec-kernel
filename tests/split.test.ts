import { describe, expect, it } from 'vitest';

import { parentIntentFrom, validateSplitProposal, type ParentIntent } from '../kernel/split.ts';
import { validSpecification } from './fixtures/valid-specification.ts';

function intent(criteria: ParentIntent['criteria']): ParentIntent {
  return { id: 'INT-01', title: 'Bounded intent', authored_by: 'requester', criteria };
}

describe('split proposals', () => {
  it('keeps a large dependent change together because count is not the test', () => {
    const criteria = Array.from({ length: 20 }, (_, index) => ({
      id: `AC-${index + 1}`,
      text: `Dependent claim ${index + 1}`,
      target: 'example/repository',
    }));
    expect(validateSplitProposal(intent(criteria), {
      verdict: 'keep',
      because: 'The criteria share one half-finished state and cannot be proved separately.',
    })).toEqual(expect.objectContaining({ ok: true, status: 'proposed' }));
  });

  it('admits two independently provable contracts even when the count is small', () => {
    const parent = intent([
      { id: 'AC-01', text: 'First outcome', target: 'example/repository-a' },
      { id: 'AC-02', text: 'Second outcome', target: 'example/repository-b' },
    ]);
    const proposal = {
      verdict: 'split',
      because: 'Each outcome has its own target, implementation, and proof.',
      contracts: [
        {
          id: 'WC-A',
          title: 'First outcome',
          target: 'example/repository-a',
          source_intent: 'INT-01',
          criteria: ['AC-01'],
          after: [],
        },
        {
          id: 'WC-B',
          title: 'Second outcome',
          target: 'example/repository-b',
          source_intent: 'INT-01',
          criteria: ['AC-02'],
          after: [],
        },
      ],
    };
    expect(validateSplitProposal(parent, proposal)).toEqual({
      ok: true,
      status: 'proposed',
      proposal,
    });
  });

  it('refuses to keep cross-repository work in one contract', () => {
    const parent = intent([
      { id: 'AC-01', text: 'First outcome', target: 'example/repository-a' },
      { id: 'AC-02', text: 'Second outcome', target: 'example/repository-b' },
    ]);
    expect(validateSplitProposal(parent, { verdict: 'keep', because: 'They are related.' })).toEqual({
      ok: false,
      problems: ['cross-repository intent must become one contract per target'],
    });
  });

  it('refuses a child whose criterion targets another repository', () => {
    const parent = intent([
      { id: 'AC-01', text: 'First outcome', target: 'example/repository-a' },
      { id: 'AC-02', text: 'Second outcome', target: 'example/repository-b' },
    ]);
    const result = validateSplitProposal(parent, {
      verdict: 'split',
      because: 'Separate proofs.',
      contracts: [
        {
          id: 'WC-A', title: 'A', target: 'example/repository-a', source_intent: 'INT-01',
          criteria: ['AC-01', 'AC-02'], after: [],
        },
        {
          id: 'WC-B', title: 'B', target: 'example/repository-b', source_intent: 'INT-01',
          criteria: ['AC-01'], after: [],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(' | ')).toContain('targets example/repository-b');
  });

  it('refuses duplicate, missing, unknown, or cyclic assignments', () => {
    const parent = intent([
      { id: 'AC-01', text: 'First outcome', target: 'example/repository' },
      { id: 'AC-02', text: 'Second outcome', target: 'example/repository' },
    ]);
    const result = validateSplitProposal(parent, {
      verdict: 'split',
      because: 'Purportedly separate.',
      contracts: [
        {
          id: 'WC-A', title: 'A', target: 'example/repository', source_intent: 'wrong-parent',
          criteria: ['AC-01', 'AC-unknown'], after: ['WC-B'],
        },
        {
          id: 'WC-B', title: 'B', target: 'example/repository', source_intent: 'INT-01',
          criteria: ['AC-01'], after: ['WC-A'],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const problems = result.problems.join(' | ');
      expect(problems).toContain('assigned more than once');
      expect(problems).toContain('not assigned: AC-02');
      expect(problems).toContain('unknown criterion');
      expect(problems).toContain('does not trace');
      expect(problems).toContain('cycle');
    }
  });

  it('refuses unevaluable input rather than proposing a split', () => {
    const result = validateSplitProposal(null, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).not.toHaveLength(0);
  });
});

describe('the parent intent a sealed specification becomes', () => {
  /*
   * D22: a contract traces to a human intent by named authorship. The parent is
   * derived from the sealed document, never re-elicited, or the chain would
   * start again from whoever happened to be at the keyboard.
   */
  it('carries the sealed identity, title, author, and every criterion', () => {
    const specification = validSpecification();
    const intent = parentIntentFrom(specification, 'sam');

    expect(intent).toEqual({
      ok: true,
      intent: {
        id: specification.id,
        title: specification.title,
        authored_by: 'sam',
        criteria: specification.acceptance.map((criterion) => ({
          id: criterion.id,
          text: criterion.text,
          target: specification.target,
        })),
      },
    });
  });

  it('feeds a split proposal the validator then admits', () => {
    const specification = validSpecification();
    const derived = parentIntentFrom(specification, 'sam');
    if (!derived.ok) throw new Error('expected a parent intent');
    const [first, ...rest] = specification.acceptance;

    const result = validateSplitProposal(derived.intent, {
      verdict: 'split',
      because: 'the two criteria do not depend on each other',
      contracts: [
        {
          id: 'WC-A', title: 'A', target: specification.target,
          source_intent: specification.id, criteria: [first!.id], after: [],
        },
        {
          id: 'WC-B', title: 'B', target: specification.target,
          source_intent: specification.id, criteria: rest.map((c) => c.id), after: ['WC-A'],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('refuses a document it cannot read rather than inventing an author', () => {
    expect(parentIntentFrom(null, 'sam').ok).toBe(false);
    expect(parentIntentFrom(validSpecification(), '  ').ok).toBe(false);
  });
});
