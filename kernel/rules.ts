import { z } from 'zod';

export const ruleIds = [
  'intent-declared',
  'specification-identified',
  'title-stated',
  'target-named',
  'scope-bounded',
  'constraints-declared',
  'acceptance-stated',
  'context-declared',
  'authority-granted',
  'irreversibility-classified',
  'risk-classified',
  'dependencies-declared',
  'blocking-decisions-declared',
  'executable-test-target',
  'unique-criterion-ids',
  'proposals-resolved',
  'human-criteria-covered',
  'evidence-producible',
  'spike-knowledge-output',
] as const;

export type RuleId = (typeof ruleIds)[number];
export type Entitlement = 'requester' | 'technical_author';

/*
 * Who may put the first value in a slot. `machine_derives` means no person is
 * ever asked: the value follows from the project declaration or from another
 * slot, so asking would be theatre. `human_confirms` means a machine may draft
 * the value but a named person turns it into a requirement.
 */
export type Authorship = 'machine_derives' | 'human_confirms';

/*
 * `authority` marks the slots that decide how much damage an agent may do
 * unsupervised. D14: an authority gap is routed, never explained harder — a
 * machine that fills these silently has granted itself the permission, and
 * seal-check passes it because the field has a value.
 */
export type Consequence = 'routine' | 'authority';

/*
 * A relational rule reads across slots. It cannot run until every structural
 * rule admits the document, or one missing slot would emit a second question
 * about a relationship that does not exist yet.
 */
export type RuleTier = 'structural' | 'relational';

export interface RuleProblem {
  slot?: string;
  message: string;
}

export interface Rule {
  id: RuleId;
  slot: string;
  question: string;
  entitlement: Entitlement;
  authorship: Authorship;
  consequence: Consequence;
  tier: RuleTier;
  valueSchema: unknown;
  check(specification: unknown): readonly RuleProblem[];
}

const nonBlank = z.string().trim().min(1);

/*
 * Structural criterion and decision shapes are deliberately laxer than
 * `specification.ts`. Verification mechanisms, id uniqueness, provenance, and
 * coverage each have their own rule; refining them here would emit two
 * questions for one problem and break the one-rule-one-question derivation.
 */
const structuralCriterionSchema = z.object({
  id: nonBlank,
  text: nonBlank,
  verification: nonBlank,
  provenance: z.enum(['human_authored', 'derived', 'proposed']),
  derivedFrom: nonBlank.optional(),
});

const structuralDecisionSchema = z.discriminatedUnion('deferred', [
  z.object({ id: nonBlank, question: nonBlank, owner: nonBlank, deferred: z.literal(true), answer: nonBlank.optional() }),
  z.object({ id: nonBlank, question: nonBlank, owner: nonBlank, deferred: z.literal(false), answer: nonBlank }),
]);

const targetTestSchema = z.object({ file: nonBlank, name: nonBlank });
const producibleMechanisms = new Set(['executable_test', 'human_review', 'rubric']);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.map(String).join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}

interface SlotRuleSpec {
  id: RuleId;
  slot: string;
  question: string;
  entitlement: Entitlement;
  authorship: Authorship;
  consequence?: Consequence;
  schema: z.ZodType;
}

/*
 * One slot, one rule, one question. The gap is always reported against the
 * whole slot so a proposed value can be applied in one piece; the issue path
 * enriches the message rather than splitting the gap.
 */
function slotRule(spec: SlotRuleSpec): Rule {
  return {
    id: spec.id,
    slot: spec.slot,
    question: spec.question,
    entitlement: spec.entitlement,
    authorship: spec.authorship,
    consequence: spec.consequence ?? 'routine',
    tier: 'structural',
    valueSchema: z.toJSONSchema(spec.schema),
    check(specification) {
      const parsed = spec.schema.safeParse(asRecord(specification)?.[spec.slot]);
      return parsed.success ? [] : [{ slot: spec.slot, message: describeIssues(parsed.error) }];
    },
  };
}

const structuralRules: readonly Rule[] = [
  slotRule({
    id: 'intent-declared',
    slot: 'intent',
    question: 'Is this a change to the system, or a spike that produces knowledge?',
    entitlement: 'requester',
    authorship: 'human_confirms',
    schema: z.object({ kind: z.enum(['change', 'spike']) }),
  }),
  slotRule({
    id: 'specification-identified',
    slot: 'id',
    question: 'Which stable identifier names this specification?',
    entitlement: 'technical_author',
    authorship: 'machine_derives',
    schema: nonBlank,
  }),
  slotRule({
    id: 'title-stated',
    slot: 'title',
    question: 'What one line names this piece of work?',
    entitlement: 'requester',
    authorship: 'human_confirms',
    schema: nonBlank,
  }),
  slotRule({
    id: 'target-named',
    slot: 'target',
    question: 'Which repository receives this change?',
    entitlement: 'technical_author',
    authorship: 'machine_derives',
    schema: nonBlank,
  }),
  slotRule({
    id: 'scope-bounded',
    slot: 'scope',
    question: 'What is inside this change, and what is explicitly outside it?',
    entitlement: 'requester',
    authorship: 'human_confirms',
    schema: z.object({ include: z.array(nonBlank).min(1), exclude: z.array(nonBlank) }),
  }),
  slotRule({
    id: 'constraints-declared',
    slot: 'constraints',
    question: 'Which constraints must the work respect? An empty list is an answer.',
    entitlement: 'requester',
    authorship: 'human_confirms',
    schema: z.array(nonBlank),
  }),
  slotRule({
    id: 'acceptance-stated',
    slot: 'acceptance',
    question: 'What observable outcome would let you say this work is done?',
    entitlement: 'requester',
    authorship: 'human_confirms',
    schema: z.array(structuralCriterionSchema).min(1),
  }),
  slotRule({
    id: 'context-declared',
    slot: 'context',
    question: 'Which existing files must the implementer read first? An empty list is an answer.',
    entitlement: 'technical_author',
    authorship: 'human_confirms',
    schema: z.array(z.object({ uri: nonBlank, contentSha: nonBlank, why: nonBlank })),
  }),
  slotRule({
    id: 'authority-granted',
    slot: 'authority',
    question: 'What may an agent do without a human, and what must a human approve first?',
    entitlement: 'requester',
    authorship: 'human_confirms',
    consequence: 'authority',
    schema: z.object({
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
  }),
  slotRule({
    id: 'irreversibility-classified',
    slot: 'irreversibility',
    question: 'If this goes wrong, is it a refactor to revert, a migration to unwind, or a rewrite?',
    entitlement: 'requester',
    authorship: 'human_confirms',
    consequence: 'authority',
    schema: z.enum(['refactor', 'migration', 'rewrite']),
  }),
  slotRule({
    id: 'risk-classified',
    slot: 'risk',
    question: 'How much damage does a wrong answer cause here: low, medium, high, or critical?',
    entitlement: 'requester',
    authorship: 'human_confirms',
    consequence: 'authority',
    schema: z.enum(['low', 'medium', 'high', 'critical']),
  }),
  slotRule({
    id: 'dependencies-declared',
    slot: 'dependsOn',
    question: 'Which other work must land before this can start? An empty list is an answer.',
    entitlement: 'requester',
    authorship: 'human_confirms',
    schema: z.array(nonBlank),
  }),
];

const blockingDecisionsDeclared: Rule = {
  id: 'blocking-decisions-declared',
  slot: 'blockingDecisions',
  question: 'Which decisions are still open and block this work? An empty list is an answer.',
  entitlement: 'requester',
  authorship: 'human_confirms',
  consequence: 'routine',
  tier: 'structural',
  valueSchema: z.toJSONSchema(z.array(structuralDecisionSchema)),
  check(specification) {
    const record = asRecord(specification);
    if (!record) return [{ message: 'a specification must be an object before decisions can be declared' }];
    if (!Object.hasOwn(record, 'blockingDecisions')) {
      return [{ message: 'blockingDecisions must be explicitly declared, including when it is empty' }];
    }
    const parsed = z.array(structuralDecisionSchema).safeParse(record['blockingDecisions']);
    return parsed.success ? [] : [{ message: describeIssues(parsed.error) }];
  },
};

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

const executableTestTarget: Rule = {
  id: 'executable-test-target',
  slot: 'acceptance.*.targetTest',
  question: 'Which test file and test name prove this executable criterion?',
  entitlement: 'technical_author',
  authorship: 'human_confirms',
  consequence: 'routine',
  tier: 'relational',
  valueSchema: z.toJSONSchema(targetTestSchema),
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
  authorship: 'machine_derives',
  consequence: 'routine',
  tier: 'relational',
  valueSchema: z.toJSONSchema(nonBlank),
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
      return [{ slot: criterionSlot(criterion, index, '.id'), message: `criterion id ${id} is not unique` }];
    });
  },
};

const proposalsResolved: Rule = {
  id: 'proposals-resolved',
  slot: 'acceptance.*.provenance',
  question: 'Will you accept or reject this proposed criterion?',
  entitlement: 'requester',
  authorship: 'human_confirms',
  consequence: 'routine',
  tier: 'relational',
  valueSchema: z.toJSONSchema(z.enum(['human_authored', 'derived'])),
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
  authorship: 'human_confirms',
  consequence: 'routine',
  tier: 'relational',
  valueSchema: z.toJSONSchema(structuralCriterionSchema),
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
  authorship: 'human_confirms',
  consequence: 'routine',
  tier: 'relational',
  valueSchema: z.toJSONSchema(z.enum(['executable_test', 'human_review', 'rubric'])),
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
  authorship: 'human_confirms',
  consequence: 'routine',
  tier: 'relational',
  valueSchema: z.toJSONSchema(z.enum(['human_review', 'rubric'])),
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
  ...structuralRules,
  blockingDecisionsDeclared,
  executableTestTarget,
  uniqueCriterionIds,
  proposalsResolved,
  humanCriteriaCovered,
  evidenceProducible,
  spikeKnowledgeOutput,
];
