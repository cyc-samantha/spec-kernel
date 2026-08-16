import { describe, expect, it } from 'vitest';

import { loadModelProposal } from '../ports/model.ts';

describe('model port response boundary', () => {
  it('admits a structured answer without attaching a provider format', () => {
    expect(loadModelProposal({
      assistantMessage: 'I understood the excluded scope.',
      answers: [{ ruleId: 'scope-bounded', slot: 'scope', value: { include: ['src/**'], exclude: [] } }],
    })).toEqual({
      ok: true,
      proposal: {
        assistantMessage: 'I understood the excluded scope.',
        answers: [{ ruleId: 'scope-bounded', slot: 'scope', value: { include: ['src/**'], exclude: [] } }],
        proposals: [],
      },
    });
  });

  /*
   * A draft without grounds cannot be reviewed, only rubber-stamped, so the
   * boundary refuses it rather than showing a person a bare value to approve.
   */
  it('refuses a drafted value that names no reason', () => {
    expect(loadModelProposal({
      assistantMessage: 'I drafted the risk.',
      answers: [],
      proposals: [{ ruleId: 'risk-classified', slot: 'risk', value: 'medium' }],
    })).toEqual({
      ok: false,
      reason: 'the model response did not match the proposal schema',
    });
  });

  it('refuses duplicate drafts for the same Rule-owned slot', () => {
    expect(loadModelProposal({
      assistantMessage: 'I drafted the risk twice.',
      answers: [],
      proposals: [
        { ruleId: 'risk-classified', slot: 'risk', value: 'low', reason: 'a display change' },
        { ruleId: 'risk-classified', slot: 'risk', value: 'high', reason: 'it moves data' },
      ],
    })).toEqual({
      ok: false,
      reason: 'the model response did not match the proposal schema',
    });
  });

  it('refuses duplicate answers for the same Rule-owned slot', () => {
    expect(loadModelProposal({
      assistantMessage: 'I understood the answer.',
      answers: [
        { ruleId: 'scope-bounded', slot: 'scope', value: [] },
        { ruleId: 'scope-bounded', slot: 'scope', value: ['generated/**'] },
      ],
    })).toEqual({
      ok: false,
      reason: 'the model response did not match the proposal schema',
    });
  });

  it('refuses more answers than the transport schema can produce', () => {
    expect(loadModelProposal({
      answers: Array.from({ length: 3 }, (_, index) => ({
        ruleId: `rule-${index}`,
        slot: `slot-${index}`,
        value: index,
      })),
      proposals: [],
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
