import { describe, expect, it } from 'vitest';

import { loadModelProposal } from '../ports/model.ts';

describe('model port response boundary', () => {
  it('admits a structured answer without attaching a provider format', () => {
    expect(loadModelProposal({
      answered: true,
      assistantMessage: 'I understood the excluded scope.',
      value: ['generated/**'],
    })).toEqual({
      ok: true,
      proposal: {
        answered: true,
        assistantMessage: 'I understood the excluded scope.',
        value: ['generated/**'],
      },
    });
  });

  it('refuses an answer that omits the proposed value', () => {
    expect(loadModelProposal({
      answered: true,
      assistantMessage: 'I understood the answer.',
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
