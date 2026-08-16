import { describe, expect, it } from 'vitest';

import { loadModelProposal } from '../ports/model.ts';

describe('model port response boundary', () => {
  it('admits a structured answer without attaching a provider format', () => {
    expect(loadModelProposal({
      assistantMessage: 'I understood the excluded scope.',
      answers: [{ ruleId: 'required-slots', slot: 'scope.exclude', value: ['generated/**'] }],
    })).toEqual({
      ok: true,
      proposal: {
        assistantMessage: 'I understood the excluded scope.',
        answers: [{ ruleId: 'required-slots', slot: 'scope.exclude', value: ['generated/**'] }],
      },
    });
  });

  it('refuses duplicate answers for the same Rule-owned slot', () => {
    expect(loadModelProposal({
      assistantMessage: 'I understood the answer.',
      answers: [
        { ruleId: 'required-slots', slot: 'scope.exclude', value: [] },
        { ruleId: 'required-slots', slot: 'scope.exclude', value: ['generated/**'] },
      ],
    })).toEqual({
      ok: false,
      reason: 'the model response did not match the proposal schema',
    });
  });

  it('refuses output that cannot be evaluated', () => {
    const unreadable = new Proxy({}, { get: () => { throw new Error('unreadable'); } });
    expect(loadModelProposal(unreadable)).toEqual({
      ok: false,
      reason: 'the model response could not be evaluated',
    });
  });
});
