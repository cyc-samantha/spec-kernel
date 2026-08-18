import { describe, expect, it } from 'vitest';

import { signableContentSha } from '../kernel/canonical.ts';
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

describe('the v1 rules', () => {
  const scenarios: {
    ruleId: string;
    mutate(specification: MutableSpecification): void;
  }[] = [
    {
      ruleId: 'title-stated',
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

  it('keeps each check, question, entitlement, and authorship in one rule object', () => {
    expect(rules).toHaveLength(22);
    for (const rule of rules) {
      expect(rule.question.trim()).not.toBe('');
      expect(rule.entitlement).toMatch(/^(requester|technical_author)$/);
      expect(rule.authorship).toMatch(/^(machine_derives|human_confirms)$/);
      expect(rule.consequence).toMatch(/^(routine|authority)$/);
      expect(rule.tier).toMatch(/^(structural|relational)$/);
      expect(rule.valueSchema).toBeDefined();
      expect(typeof rule.check).toBe('function');
    }
  });

  /*
   * These slots decide how much damage an agent may do unsupervised, and who
   * said it could. A machine may draft them; only a named person may turn a
   * draft into the grant itself (D14, D22).
   */
  it('never lets a machine originate an authority grant', () => {
    const consequential = rules.filter((rule) => rule.consequence === 'authority');
    expect(consequential.map((rule) => rule.slot).sort())
      .toEqual(['authority', 'irreversibility', 'risk', 'signature', 'signature.contentSha']);
    for (const rule of consequential) {
      expect(rule.authorship).toBe('human_confirms');
    }
  });
});

describe('required slots', () => {
  const slotRules = [
    ['intent', 'intent-declared'],
    ['id', 'specification-identified'],
    ['title', 'title-stated'],
    ['target', 'target-named'],
    ['scope', 'scope-bounded'],
    ['constraints', 'constraints-declared'],
    ['acceptance', 'acceptance-stated'],
    ['context', 'context-declared'],
    ['authority', 'authority-granted'],
    ['irreversibility', 'irreversibility-classified'],
    ['risk', 'risk-classified'],
    ['dependsOn', 'dependencies-declared'],
  ] as const;

  it.each(slotRules)('reports only %s own rule when it is absent', (slot, ruleId) => {
    const specification = validSpecification() as MutableSpecification;
    delete specification[slot];
    expect(ruleIdsFor(specification)).toEqual([ruleId]);
  });

  /*
   * The gap is reported against the whole slot so one proposed value can fill
   * it in a single piece; the path inside the slot enriches the message.
   */
  it('reports a nested blank string against the slot that owns it', () => {
    const specification = validSpecification();
    specification.context[0]!.why = '  ';
    expect(sealCheck(specification)).toEqual([
      expect.objectContaining({
        ruleId: 'context-declared',
        slot: 'context',
        message: expect.stringContaining('0.why'),
      }),
    ]);
  });
});

describe('spike specifications', () => {
  it('admits criteria whose output is reviewable knowledge', () => {
    const specification = validSpecification();
    specification.intent.kind = 'spike';
    specification.acceptance[0]!.text = 'We know which export formats preserve the required data';
    specification.acceptance[1]!.text = 'The findings compare every candidate format';
    specification.acceptance[1]!.verification = 'rubric';
    specification.acceptance[1]!.rubricRationale = 'a finding is a comparison, and no assertion settles which comparison is complete';
    delete specification.acceptance[1]!.targetTest;
    expect(sealCheck(specification)).toEqual([]);
  });

  it('refuses a spike that claims an executable change as its output', () => {
    const specification = validSpecification();
    specification.intent.kind = 'spike';
    expect(ruleIdsFor(specification)).toEqual(['spike-knowledge-output']);
  });
});

/*
 * D46. Until now `sealed` meant "every rule passed", and the two documents most
 * worth stopping — a rewrite, and a critical risk — were exactly the ones this
 * layer sealed and left the execution layer to refuse afterwards, by which time
 * a team has already built against the shape.
 */
describe('the seal', () => {
  function signedCopy(specification: Specification): Specification {
    return {
      ...specification,
      signature: {
        by: 'a named approver',
        at: '2026-08-18T09:00:00Z',
        contentSha: signableContentSha(specification),
      },
    };
  }

  function ruleNamed(id: string) {
    const rule = rules.find((candidate) => candidate.id === id);
    if (!rule) throw new Error(`no rule named ${id}`);
    return rule;
  }

  it('does not ask a low-risk document for a signature', () => {
    expect(sealCheck(validSpecification())).toEqual([]);
  });

  it.each(['rewrite', 'critical'])('refuses to seal an unsigned %s', (blastRadius) => {
    const specification = validSpecification();
    if (blastRadius === 'rewrite') specification.irreversibility = 'rewrite';
    else specification.risk = 'critical';
    expect(ruleIdsFor(specification)).toEqual(['signature-required']);
  });

  it('seals the same document once it is signed', () => {
    const specification = validSpecification();
    specification.risk = 'critical';
    expect(sealCheck(signedCopy(specification))).toEqual([]);
  });

  /*
   * The signature is not part of what it signs, so countersigning is not an
   * edit. If it were, the second signer would invalidate the first and no
   * document could ever carry two.
   */
  it('does not treat signing as a change to the thing signed', () => {
    const specification = validSpecification();
    expect(signableContentSha(signedCopy(specification))).toBe(signableContentSha(specification));
  });

  it('refuses a document edited after it was signed, and names both hashes', () => {
    const signed = signedCopy(validSpecification());
    signed.scope.include.push('src/export/legacy/**');
    const problems = sealCheck(signed);
    expect(problems.map((problem) => problem.ruleId)).toEqual(['signature-binds-content']);
    expect(problems[0]?.message).toContain('no longer matches');
  });

  /*
   * The fail-closed halves. Both rules read across slots, so `sealCheck` never
   * hands them a non-document — which is precisely why the branch has to be
   * tested directly. A gate that has never been asked an unanswerable question
   * has not been shown to refuse one.
   */
  it.each(['signature-required', 'signature-binds-content'])('%s refuses what it cannot read', (id) => {
    for (const unevaluable of [undefined, null, 'a specification', 42]) {
      expect(ruleNamed(id).check(unevaluable)).toHaveLength(1);
    }
  });

  it('reports a signature it cannot parse as a missing one, not a satisfied slot', () => {
    const specification = validSpecification() as Record<string, unknown>;
    specification['risk'] = 'critical';
    specification['signature'] = { by: 'a named approver', at: 'yesterday' };
    expect(ruleIdsFor(specification)).toEqual(['signature-required']);
  });

  /*
   * The drift rule skips a signature it cannot parse, so that one bad value
   * produces one question rather than two. That is only safe while the rule
   * above refuses a malformed signature nobody asked for — this asserts the
   * pairing, which is the seam a later change would open without noticing.
   */
  it('refuses a malformed signature even on a document that needed none', () => {
    const specification = validSpecification() as Record<string, unknown>;
    specification['signature'] = { by: 'a named approver', at: 'yesterday' };
    expect(ruleIdsFor(specification)).toEqual(['signature-required']);
  });
});

/*
 * D43. Both halves are load-bearing: removing `human_review` without requiring
 * the rubric's argument moves the stall rather than closing it, and the author
 * who writes the unargued rubric is usually the one who never heard the
 * mechanism had been removed.
 */
describe('a criterion nobody downstream can service', () => {
  it('refuses human_review, and says what to write instead', () => {
    const specification = validSpecification();
    (specification.acceptance[0] as Record<string, unknown>)['verification'] = 'human_review';
    const problems = sealCheck(specification).filter((item) => item.ruleId === 'evidence-producible');
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('rubric');
  });

  it('refuses a rubric that does not argue for itself', () => {
    const specification = validSpecification();
    delete specification.acceptance[0]!.rubricRationale;
    expect(ruleIdsFor(specification)).toEqual(['rubric-argued']);
  });

  /*
   * A rationale that is not text cannot be read as an argument. The rule must
   * refuse it rather than treat a present key as a satisfied requirement —
   * "has a value" is the failure mode the mechanism was removed for.
   */
  it('refuses a rationale it cannot read', () => {
    const specification = validSpecification();
    (specification.acceptance[0] as Record<string, unknown>)['rubricRationale'] = 42;
    expect(ruleIdsFor(specification)).toEqual(['rubric-argued']);
  });

  /*
   * A verification that is not text is caught structurally, before any
   * relational rule is asked to reason about it. Asserting that here keeps the
   * early return in `sealCheck` from quietly becoming the reason a nonsense
   * mechanism passes.
   */
  it('refuses a verification it cannot read, without consulting the mechanism rules', () => {
    const specification = validSpecification();
    (specification.acceptance[0] as Record<string, unknown>)['verification'] = null;
    expect(ruleIdsFor(specification)).toEqual(['acceptance-stated']);
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
    expect(ruleIdsFor(specification)).toEqual(['blocking-decisions-declared']);
  });
});

describe('fail-closed behaviour', () => {
  it('refuses malformed input instead of treating it as an empty missing list', () => {
    const missing = sealCheck(null);
    expect(missing).not.toEqual([]);
    expect(missing.every((item) => item.entitlement !== undefined)).toBe(true);
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
