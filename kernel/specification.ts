import { z } from 'zod';

const nonBlank = z.string().trim().min(1);

export const verificationMechanisms = [
  'executable_test',
  'deterministic_assertion',
  'human_review',
  'rubric',
] as const;

export const provenanceValues = ['derived', 'human_authored', 'proposed'] as const;

const targetTestSchema = z.object({
  file: nonBlank,
  name: nonBlank,
});

const criterionBase = {
  id: nonBlank,
  text: nonBlank,
  verification: z.enum(verificationMechanisms),
  targetTest: targetTestSchema.optional(),
};

export const acceptanceCriterionSchema = z.discriminatedUnion('provenance', [
  z.object({
    ...criterionBase,
    provenance: z.literal('human_authored'),
    derivedFrom: z.never().optional(),
  }),
  z.object({
    ...criterionBase,
    provenance: z.literal('derived'),
    derivedFrom: nonBlank,
  }),
  z.object({
    ...criterionBase,
    provenance: z.literal('proposed'),
    derivedFrom: nonBlank.optional(),
  }),
]);

const blockingDecisionBase = {
  id: nonBlank,
  question: nonBlank,
  owner: nonBlank,
};

export const blockingDecisionSchema = z.discriminatedUnion('deferred', [
  z.object({ ...blockingDecisionBase, deferred: z.literal(true), answer: nonBlank.optional() }),
  z.object({ ...blockingDecisionBase, deferred: z.literal(false), answer: nonBlank }),
]);

/** The document handed to the execution boundary once every rule admits it. */
export const specificationSchema = z.object({
  intent: z.object({ kind: z.enum(['change', 'spike']) }),
  id: nonBlank,
  title: nonBlank,
  target: nonBlank,
  scope: z.object({
    include: z.array(nonBlank).min(1),
    exclude: z.array(nonBlank),
  }),
  constraints: z.array(nonBlank),
  acceptance: z.array(acceptanceCriterionSchema).min(1),
  context: z.array(
    z.object({
      uri: nonBlank,
      contentSha: nonBlank,
      why: nonBlank,
    }),
  ),
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
  blockingDecisions: z.array(blockingDecisionSchema),
  signature: z
    .object({
      by: nonBlank,
      at: nonBlank,
    })
    .optional(),
});

export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>;
export type Specification = z.infer<typeof specificationSchema>;
export type VerificationMechanism = (typeof verificationMechanisms)[number];
