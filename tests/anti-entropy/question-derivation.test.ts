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

function dropSlot(specification: Specification, slot: keyof Specification): unknown {
  delete (specification as Partial<Specification>)[slot];
  return specification;
}

const fixtures: readonly QuestionFixture[] = [
  { ruleId: 'intent-declared', removeAnswer: (spec) => dropSlot(spec, 'intent') },
  { ruleId: 'specification-identified', removeAnswer: (spec) => dropSlot(spec, 'id') },
  { ruleId: 'title-stated', removeAnswer: (spec) => dropSlot(spec, 'title') },
  { ruleId: 'target-named', removeAnswer: (spec) => dropSlot(spec, 'target') },
  { ruleId: 'scope-bounded', removeAnswer: (spec) => dropSlot(spec, 'scope') },
  { ruleId: 'constraints-declared', removeAnswer: (spec) => dropSlot(spec, 'constraints') },
  { ruleId: 'acceptance-stated', removeAnswer: (spec) => dropSlot(spec, 'acceptance') },
  { ruleId: 'context-declared', removeAnswer: (spec) => dropSlot(spec, 'context') },
  { ruleId: 'authority-granted', removeAnswer: (spec) => dropSlot(spec, 'authority') },
  { ruleId: 'irreversibility-classified', removeAnswer: (spec) => dropSlot(spec, 'irreversibility') },
  { ruleId: 'risk-classified', removeAnswer: (spec) => dropSlot(spec, 'risk') },
  { ruleId: 'dependencies-declared', removeAnswer: (spec) => dropSlot(spec, 'dependsOn') },
  {
    ruleId: 'blocking-decisions-declared',
    removeAnswer(specification) {
      delete (specification as Partial<Specification>).blockingDecisions;
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

  /*
   * A question shared by two rules cannot tell a person which gap it is about.
   * One wording covering many slots is how an interview repeats itself until
   * the requester gives up, so the wording is part of the derivation.
   */
  it('gives every rule a question no other rule asks', () => {
    const questions = rules.map((rule) => rule.question);
    expect(new Set(questions).size).toBe(rules.length);
  });

  it('asks a distinct question for every gap in an empty draft', () => {
    const missing = sealCheck({});
    expect(missing.length).toBeGreaterThan(1);
    expect(new Set(missing.map((item) => item.question)).size).toBe(missing.length);
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
