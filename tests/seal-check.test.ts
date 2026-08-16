import { describe, expect, it } from 'vitest';

import { rules } from '../kernel/rules.ts';
import { sealCheck } from '../kernel/seal-check.ts';
import { specificationSchema, type Specification } from '../kernel/specification.ts';

import { validSpecification } from './fixtures/valid-specification.ts';

type MutableSpecification = Specification & Record<string, unknown>;

function ruleIdsFor(value: unknown): string[] {
  return [...new Set(sealCheck(value).map((item) => item.ruleId))];
}

describe('a complete specification', () => {
  it('has no missing items', () => {
    const specification = validSpecification();
    expect(specificationSchema.safeParse(specification).success).toBe(true);
    expect(sealCheck(specification)).toEqual([]);
  });
});

describe('the seven v1 rules', () => {
  const scenarios: {
    ruleId: string;
    mutate(specification: MutableSpecification): void;
  }[] = [
    {
      ruleId: 'required-slots',
      mutate: (specification) => {
        specification.title = '   ';
      },
    },
    {
      ruleId: 'executable-test-target',
      mutate: (specification) => {
        delete specification.acceptance[1]!.targetTest;
      },
    },
    {
      ruleId: 'unique-criterion-ids',
      mutate: (specification) => {
        specification.acceptance[1]!.id = specification.acceptance[0]!.id;
      },
    },
    {
      ruleId: 'blocking-decisions-declared',
      mutate: (specification) => {
        delete (specification as Partial<Specification>).blockingDecisions;
      },
    },
    {
      ruleId: 'proposals-resolved',
      mutate: (specification) => {
        specification.acceptance[0]!.provenance = 'proposed';
      },
    },
    {
      ruleId: 'human-criteria-covered',
      mutate: (specification) => {
        specification.acceptance[1]!.derivedFrom = 'AC-99';
      },
    },
    {
      ruleId: 'evidence-producible',
      mutate: (specification) => {
        specification.acceptance[1]!.verification = 'deterministic_assertion';
      },
    },
    {
      ruleId: 'spike-knowledge-output',
      mutate: (specification) => {
        specification.intent.kind = 'spike';
      },
    },
  ];

  it.each(scenarios)('reports only $ruleId when that rule is broken', ({ ruleId, mutate }) => {
    const specification = validSpecification() as MutableSpecification;
    mutate(specification);
    expect(ruleIdsFor(specification)).toEqual([ruleId]);
  });

  it('keeps each check, question, and entitlement in one rule object', () => {
    expect(rules).toHaveLength(8);
    for (const rule of rules) {
      expect(rule.question.trim()).not.toBe('');
      expect(rule.entitlement).toMatch(/^(requester|technical_author)$/);
      expect(typeof rule.check).toBe('function');
    }
  });
});

describe('required slots', () => {
  const topLevelSlots = [
    'intent',
    'id',
    'title',
    'target',
    'scope',
    'constraints',
    'acceptance',
    'context',
    'authority',
    'irreversibility',
    'risk',
    'dependsOn',
  ] as const;

  it.each(topLevelSlots)('reports the required-slots rule when %s is absent', (slot) => {
    const specification = validSpecification() as MutableSpecification;
    delete specification[slot];
    expect(ruleIdsFor(specification)).toEqual(['required-slots']);
  });

  it('reports nested blank strings by their slot', () => {
    const specification = validSpecification();
    specification.context[0]!.why = '  ';
    expect(sealCheck(specification)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'required-slots', slot: 'context.0.why' }),
      ]),
    );
  });
});

describe('spike specifications', () => {
  it('admits criteria whose output is reviewable knowledge', () => {
    const specification = validSpecification();
    specification.intent.kind = 'spike';
    specification.acceptance[0]!.text = 'We know which export formats preserve the required data';
    specification.acceptance[1]!.text = 'The findings compare every candidate format';
    specification.acceptance[1]!.verification = 'rubric';
    delete specification.acceptance[1]!.targetTest;
    expect(sealCheck(specification)).toEqual([]);
  });

  it('refuses a spike that claims an executable change as its output', () => {
    const specification = validSpecification();
    specification.intent.kind = 'spike';
    expect(ruleIdsFor(specification)).toEqual(['spike-knowledge-output']);
  });
});

describe('criterion relationships', () => {
  it('reports every human-authored criterion without a derived child', () => {
    const specification = validSpecification();
    specification.acceptance.push({
      id: 'AC-03',
      text: 'A second observable outcome',
      verification: 'rubric',
      provenance: 'human_authored',
    });
    expect(sealCheck(specification)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'human-criteria-covered', slot: 'acceptance.AC-03' }),
      ]),
    );
  });

  it('reports each occurrence of a duplicate criterion id', () => {
    const specification = validSpecification();
    specification.acceptance[1]!.id = 'AC-01';
    const duplicateItems = sealCheck(specification).filter(
      (item) => item.ruleId === 'unique-criterion-ids',
    );
    expect(duplicateItems).toHaveLength(2);
  });
});

describe('blocking decisions', () => {
  it('admits an answered decision', () => {
    const specification = validSpecification();
    specification.blockingDecisions = [
      { id: 'BD-01', question: 'Which format?', owner: 'owner@example.test', deferred: false, answer: 'JSON' },
    ];
    expect(sealCheck(specification)).toEqual([]);
  });

  it('admits an explicitly deferred decision', () => {
    const specification = validSpecification();
    specification.blockingDecisions = [
      { id: 'BD-01', question: 'Which format?', owner: 'owner@example.test', deferred: true },
    ];
    expect(sealCheck(specification)).toEqual([]);
  });

  it('refuses a non-deferred decision without an answer', () => {
    const specification = validSpecification() as unknown as Record<string, unknown>;
    specification['blockingDecisions'] = [
      { id: 'BD-01', question: 'Which format?', owner: 'owner@example.test', deferred: false },
    ];
    expect(ruleIdsFor(specification)).toEqual(['required-slots']);
  });
});

describe('fail-closed behaviour', () => {
  it('refuses malformed input instead of treating it as an empty missing list', () => {
    expect(sealCheck(null)).toEqual([
      expect.objectContaining({ ruleId: 'required-slots', slot: '(root)' }),
    ]);
  });

  it('refuses input that cannot be evaluated', () => {
    const unevaluable = new Proxy(
      {},
      {
        get() {
          throw new Error('unreadable');
        },
      },
    );
    const missing = sealCheck(unevaluable);
    expect(missing).not.toEqual([]);
    expect(missing.some((item) => item.message.includes('could not be evaluated'))).toBe(true);
  });
});
