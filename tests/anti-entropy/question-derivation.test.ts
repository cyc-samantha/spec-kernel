/**
 * Every question must prevent a downstream refusal. A question with no fixture
 * is advice that slipped into the kernel; a rule with no question leaves a
 * refusal the author was never given a chance to prevent.
 */
import { describe, expect, it } from 'vitest';

import { rules, type RuleId } from '../../kernel/rules.ts';
import { sealCheck } from '../../kernel/seal-check.ts';
import type { Specification } from '../../kernel/specification.ts';

import { validSpecification } from '../fixtures/valid-specification.ts';

interface QuestionFixture {
  ruleId: RuleId;
  removeAnswer(specification: Specification): unknown;
}

const fixtures: readonly QuestionFixture[] = [
  {
    ruleId: 'required-slots',
    removeAnswer(specification) {
      delete (specification as Partial<Specification>).title;
      return specification;
    },
  },
  {
    ruleId: 'executable-test-target',
    removeAnswer(specification) {
      delete specification.acceptance[1]!.targetTest;
      return specification;
    },
  },
  {
    ruleId: 'unique-criterion-ids',
    removeAnswer(specification) {
      specification.acceptance[1]!.id = specification.acceptance[0]!.id;
      return specification;
    },
  },
  {
    ruleId: 'blocking-decisions-declared',
    removeAnswer(specification) {
      delete (specification as Partial<Specification>).blockingDecisions;
      return specification;
    },
  },
  {
    ruleId: 'proposals-resolved',
    removeAnswer(specification) {
      specification.acceptance[0]!.provenance = 'proposed';
      return specification;
    },
  },
  {
    ruleId: 'human-criteria-covered',
    removeAnswer(specification) {
      specification.acceptance[1]!.derivedFrom = 'AC-unknown';
      return specification;
    },
  },
  {
    ruleId: 'evidence-producible',
    removeAnswer(specification) {
      specification.acceptance[1]!.verification = 'deterministic_assertion';
      return specification;
    },
  },
  {
    ruleId: 'spike-knowledge-output',
    removeAnswer(specification) {
      specification.intent.kind = 'spike';
      return specification;
    },
  },
];

describe('question derivation', () => {
  it('has exactly one load-bearing fixture for every rule', () => {
    expect(fixtures).toHaveLength(rules.length);
    expect(fixtures.map((fixture) => fixture.ruleId)).toEqual(rules.map((rule) => rule.id));
  });

  it.each(fixtures)('$ruleId becomes missing when its answer is removed', (fixture) => {
    const missing = sealCheck(fixture.removeAnswer(validSpecification()));
    const item = missing.find((candidate) => candidate.ruleId === fixture.ruleId);
    const rule = rules.find((candidate) => candidate.id === fixture.ruleId);

    expect(item).toBeDefined();
    expect(item?.question).toBe(rule?.question);
    expect(item?.question.trim()).not.toBe('');
  });
});
