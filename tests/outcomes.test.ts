import { describe, expect, it } from 'vitest';

import { appendOutcome, learningCandidates } from '../kernel/outcomes.ts';

const FIRST = {
  specification_version: 'spec-v3',
  requester_verdict: 'wrong' as const,
  missing_rule: 'observable-ordering',
};

describe('green-but-wrong outcomes', () => {
  it('appends the requester verdict without changing any existing byte', () => {
    const first = appendOutcome('', FIRST);
    if (!first.ok) throw new Error(first.problems.join('; '));
    const second = appendOutcome(first.text, {
      specification_version: 'spec-v4',
      requester_verdict: 'wrong',
      missing_rule: 'boundary-example',
    });
    if (!second.ok) throw new Error(second.problems.join('; '));

    expect(second.text.startsWith(first.text)).toBe(true);
    expect(second.text).not.toBe(first.text);
    expect(learningCandidates(second.text)).toEqual(['observable-ordering', 'boundary-example']);
  });

  it('refuses a record that cannot identify the missing rule', () => {
    const result = appendOutcome('', { ...FIRST, missing_rule: '  ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).not.toHaveLength(0);
  });

  it('refuses to append to an unevaluable log', () => {
    expect(appendOutcome('{not-json}\n', FIRST)).toEqual({
      ok: false,
      problems: ['the existing outcome log could not be evaluated'],
    });
  });

  it('deduplicates repeated learning candidates without rewriting the log', () => {
    const first = appendOutcome('', FIRST);
    if (!first.ok) throw new Error(first.problems.join('; '));
    const second = appendOutcome(first.text, { ...FIRST, specification_version: 'spec-v4' });
    if (!second.ok) throw new Error(second.problems.join('; '));
    expect(learningCandidates(second.text)).toEqual(['observable-ordering']);
    expect(second.text.split('\n').filter(Boolean)).toHaveLength(2);
  });
});
