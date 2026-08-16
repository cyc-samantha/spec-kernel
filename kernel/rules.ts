import { z } from 'zod';

export const ruleIds = [
  'required-slots',
  'executable-test-target',
  'unique-criterion-ids',
  'blocking-decisions-declared',
  'proposals-resolved',
  'human-criteria-covered',
  'evidence-producible',
  'spike-knowledge-output',
] as const;

export type RuleId = (typeof ruleIds)[number];
export type Entitlement = 'requester' | 'technical_author';

export interface RuleProblem {
  slot?: string;
  message: string;
}

export interface Rule {
  id: RuleId;
  slot: string;
  question: string;
  entitlement: Entitlement;
  check(specification: unknown): readonly RuleProblem[];
}

const nonBlank = z.string().trim().min(1);

const requiredCriterionBase = {
  id: nonBlank,
  text: nonBlank,
  verification: nonBlank,
};

const requiredCriterionSchema = z.discriminatedUnion('provenance', [
  z.object({
    ...requiredCriterionBase,
    provenance: z.literal('human_authored'),
    derivedFrom: z.never().optional(),
  }),
  z.object({
    ...requiredCriterionBase,
    provenance: z.literal('derived'),
    derivedFrom: nonBlank,
  }),
  z.object({
    ...requiredCriterionBase,
    provenance: z.literal('proposed'),
    derivedFrom: nonBlank.optional(),
  }),
]);

const requiredDecisionBase = { id: nonBlank, question: nonBlank, owner: nonBlank };
const requiredDecisionSchema = z.discriminatedUnion('deferred', [
  z.object({ ...requiredDecisionBase, deferred: z.literal(true), answer: nonBlank.optional() }),
  z.object({ ...requiredDecisionBase, deferred: z.literal(false), answer: nonBlank }),
]);

/*
 * This structural schema deliberately leaves the other six decisions to their
 * own rules. If they were refinements here, one missing answer would emit two
 * questions and the question set would no longer be derived one-to-one.
 */
const requiredSlotsSchema = z.object({
  intent: z.object({ kind: z.enum(['change', 'spike']) }),
  id: nonBlank,
  title: nonBlank,
  target: nonBlank,
  scope: z.object({ include: z.array(nonBlank).min(1), exclude: z.array(nonBlank) }),
  constraints: z.array(nonBlank),
  acceptance: z.array(requiredCriterionSchema).min(1),
  context: z.array(z.object({ uri: nonBlank, contentSha: nonBlank, why: nonBlank })),
  authority: z.object({
    allowed: z.array(nonBlank),
    requiresHuman: z.array(nonBlank),
    automationLevel: z.enum([
      'human-only',
      'human-approves',
      'agent-with-review',
      'agent-autonomous',
      'deterministic',
    ]),
  }),
  irreversibility: z.enum(['refactor', 'migration', 'rewrite']),
  risk: z.enum(['low', 'medium', 'high', 'critical']),
  dependsOn: z.array(nonBlank),
  blockingDecisions: z.array(requiredDecisionSchema).optional(),
  signature: z.object({ by: nonBlank, at: nonBlank }).optional(),
});

const targetTestSchema = z.object({ file: nonBlank, name: nonBlank });
const producibleMechanisms = new Set(['executable_test', 'human_review', 'rubric']);

function pathOf(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '(root)' : path.map(String).join('.');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function criteriaOf(value: unknown): Record<string, unknown>[] {
  const acceptance = asRecord(value)?.['acceptance'];
  if (!Array.isArray(acceptance)) return [];
  return acceptance.flatMap((criterion) => {
    const record = asRecord(criterion);
    return record ? [record] : [];
  });
}

function criterionSlot(criterion: Record<string, unknown>, index: number, suffix = ''): string {
  const id = typeof criterion['id'] === 'string' && criterion['id'].trim() ? criterion['id'] : String(index);
  return `acceptance.${id}${suffix}`;
}

const requiredSlots: Rule = {
  id: 'required-slots',
  slot: '*',
  question: 'What value belongs in each missing required specification slot?',
  entitlement: 'requester',
  check(specification) {
    const parsed = requiredSlotsSchema.safeParse(specification);
    if (parsed.success) return [];
    return parsed.error.issues.map((issue) => ({
      slot: pathOf(issue.path),
      message: issue.message,
    }));
  },
};

const executableTestTarget: Rule = {
  id: 'executable-test-target',
  slot: 'acceptance.*.targetTest',
  question: 'Which test file and test name prove this executable criterion?',
  entitlement: 'technical_author',
  check(specification) {
    return criteriaOf(specification).flatMap((criterion, index) => {
      if (criterion['verification'] !== 'executable_test') return [];
      if (targetTestSchema.safeParse(criterion['targetTest']).success) return [];
      return [{
        slot: criterionSlot(criterion, index, '.targetTest'),
        message: 'an executable_test criterion must name a non-blank test file and test name',
      }];
    });
  },
};

const uniqueCriterionIds: Rule = {
  id: 'unique-criterion-ids',
  slot: 'acceptance.*.id',
  question: 'Which unique id should identify each acceptance criterion?',
  entitlement: 'technical_author',
  check(specification) {
    const criteria = criteriaOf(specification);
    const counts = new Map<string, number>();
    for (const criterion of criteria) {
      const id = criterion['id'];
      if (typeof id === 'string' && id.trim()) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return criteria.flatMap((criterion, index) => {
      const id = criterion['id'];
      if (typeof id !== 'string' || (counts.get(id) ?? 0) < 2) return [];
      return [{
        slot: criterionSlot(criterion, index, '.id'),
        message: `criterion id ${id} is not unique`,
      }];
    });
  },
};

const blockingDecisionsDeclared: Rule = {
  id: 'blocking-decisions-declared',
  slot: 'blockingDecisions',
  question: 'Were blocking decisions considered, and which decisions remain?',
  entitlement: 'requester',
  check(specification) {
    const record = asRecord(specification);
    if (!record) return [];
    if (Object.hasOwn(record, 'blockingDecisions')) return [];
    return [{ message: 'blockingDecisions must be explicitly declared, including when it is empty' }];
  },
};

const proposalsResolved: Rule = {
  id: 'proposals-resolved',
  slot: 'acceptance.*.provenance',
  question: 'Will the requester accept or reject this proposed criterion?',
  entitlement: 'requester',
  check(specification) {
    return criteriaOf(specification).flatMap((criterion, index) =>
      criterion['provenance'] === 'proposed'
        ? [{
            slot: criterionSlot(criterion, index, '.provenance'),
            message: 'a proposed criterion is not yet a human requirement',
          }]
        : [],
    );
  },
};

const humanCriteriaCovered: Rule = {
  id: 'human-criteria-covered',
  slot: 'acceptance.*.derivedFrom',
  question: 'Which derived criterion verifies this requester-authored criterion?',
  entitlement: 'technical_author',
  check(specification) {
    const criteria = criteriaOf(specification);
    const covered = new Set(
      criteria
        .filter((criterion) => criterion['provenance'] === 'derived')
        .map((criterion) => criterion['derivedFrom'])
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    );
    return criteria.flatMap((criterion, index) => {
      if (criterion['provenance'] !== 'human_authored') return [];
      const id = criterion['id'];
      if (typeof id === 'string' && covered.has(id)) return [];
      return [{
        slot: criterionSlot(criterion, index),
        message: 'a human_authored criterion needs at least one derived criterion pointing to it',
      }];
    });
  },
};

const evidenceProducible: Rule = {
  id: 'evidence-producible',
  slot: 'acceptance.*.verification',
  question: 'Which supported verification mechanism can produce evidence for this criterion?',
  entitlement: 'technical_author',
  check(specification) {
    return criteriaOf(specification).flatMap((criterion, index) => {
      const mechanism = criterion['verification'];
      if (typeof mechanism !== 'string' || !mechanism.trim() || producibleMechanisms.has(mechanism)) return [];
      return [{
        slot: criterionSlot(criterion, index, '.verification'),
        message: `${mechanism} cannot produce evidence at the execution boundary`,
      }];
    });
  },
};

const spikeKnowledgeOutput: Rule = {
  id: 'spike-knowledge-output',
  slot: 'acceptance.*.verification',
  question: 'What knowledge will this spike produce, and how will a person review it?',
  entitlement: 'requester',
  check(specification) {
    const intent = asRecord(asRecord(specification)?.['intent']);
    if (intent?.['kind'] !== 'spike') return [];
    return criteriaOf(specification).flatMap((criterion, index) => {
      const mechanism = criterion['verification'];
      if (mechanism === 'human_review' || mechanism === 'rubric') return [];
      return [{
        slot: criterionSlot(criterion, index, '.verification'),
        message: 'a spike criterion must produce reviewable knowledge rather than claim a change',
      }];
    });
  },
};

export const rules: readonly Rule[] = [
  requiredSlots,
  executableTestTarget,
  uniqueCriterionIds,
  blockingDecisionsDeclared,
  proposalsResolved,
  humanCriteriaCovered,
  evidenceProducible,
  spikeKnowledgeOutput,
];
