import { describe, expect, it } from 'vitest';

import { ModelPortError, type SplitPort } from '../ports/model.ts';
import { proposeSplit } from '../ui/split-review.ts';

import { validSpecification } from './fixtures/valid-specification.ts';

function port(reply: unknown): SplitPort {
  return { splitIntent: async () => reply };
}

function contractsFor(specification: ReturnType<typeof validSpecification>) {
  const [first, ...rest] = specification.acceptance;
  return [
    {
      id: 'WC-A', title: 'First slice', target: specification.target,
      source_intent: specification.id, criteria: [first!.id], after: [],
    },
    {
      id: 'WC-B', title: 'Second slice', target: specification.target,
      source_intent: specification.id, criteria: rest.map((criterion) => criterion.id), after: ['WC-A'],
    },
  ];
}

describe('splitting a sealed specification into claimable contracts', () => {
  it('returns contracts the kernel admits, each tracing to the sealed intent', async () => {
    const specification = validSpecification();
    const result = await proposeSplit(specification, 'sam', port({
      verdict: 'split',
      because: 'neither slice waits on the other',
      contracts: contractsFor(specification),
    }));

    expect(result).toEqual({
      status: 'split',
      because: 'neither slice waits on the other',
      contracts: contractsFor(specification),
    });
  });

  it('reports work that is already one contract without inventing a second', async () => {
    const result = await proposeSplit(validSpecification(), 'sam', port({
      verdict: 'keep',
      because: 'the export cannot be reviewed without the format it writes',
    }));

    expect(result).toEqual({
      status: 'whole',
      because: 'the export cannot be reviewed without the format it writes',
    });
  });

  /*
   * D22: a contract that does not trace to the parent is a ticket with no
   * author. The model may suggest the division; only the kernel admits it.
   */
  it('refuses a division that drops a criterion instead of shipping it', async () => {
    const specification = validSpecification();
    const [first] = specification.acceptance;
    const result = await proposeSplit(specification, 'sam', port({
      verdict: 'split',
      because: 'looks separable',
      contracts: [
        {
          id: 'WC-A', title: 'First', target: specification.target,
          source_intent: specification.id, criteria: [first!.id], after: [],
        },
        {
          id: 'WC-B', title: 'Second', target: specification.target,
          source_intent: specification.id, criteria: [first!.id], after: [],
        },
      ],
    }));

    expect(result.status).toBe('refused');
    if (result.status === 'refused') {
      expect(result.problems.join(' | ')).toContain('assigned more than once');
    }
  });

  it('refuses a document that never sealed', async () => {
    const result = await proposeSplit({ title: 'half a draft' }, 'sam', port({
      verdict: 'keep',
      because: 'unused',
    }));
    expect(result).toEqual(expect.objectContaining({ status: 'refused' }));
  });

  it('refuses an unavailable runtime without proposing a division', async () => {
    const failing: SplitPort = {
      splitIntent: async () => { throw new ModelPortError('unavailable', 'offline'); },
    };
    const result = await proposeSplit(validSpecification(), 'sam', failing);
    expect(result).toEqual({
      status: 'refused',
      reason: 'the configured model is unavailable',
      problems: [],
    });
  });

  it('refuses a verdict that is not one of the two the kernel knows', async () => {
    const result = await proposeSplit(validSpecification(), 'sam', port({ verdict: 'maybe' }));
    expect(result).toEqual(expect.objectContaining({ status: 'refused' }));
  });
});
