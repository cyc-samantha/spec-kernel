/**
 * A checked-in copy of the shape the ticket layer admits.
 *
 * It is a copy on purpose (D45). The three layers are on three zod majors —
 * 4.4.3 here, 3.23.8 there, ^3.24.1 above — so importing the real schema would
 * couple this repository's dependency graph to a downstream upgrade schedule and
 * produce failures that say nothing about whether the contract is right.
 *
 * The cost is the one D6 warns about: two lists that must agree will stop
 * agreeing. What is bought for it is that the disagreement surfaces here, in a
 * test, rather than in a queue. Re-verify against the real thing by parsing a
 * projected contract with `agent-ticket-system`'s own `workContractSchema` —
 * that check is recorded in `docs/BUILD-PLAN.md` § S19c and is not automated,
 * because automating it is what this file exists to avoid.
 *
 * Mirrors `agent-ticket-system/src/contract/work-contract.ts` and the schemas it
 * composes, as of 2026-08-18. Every object there is `.strict()`; every name is
 * snake_case.
 */
import { z } from 'zod';

const nonBlank = z.string().trim().min(1);

const contractId = z
  .string()
  .regex(/^[a-z0-9]+(?:[-:][a-z0-9]+)*$/, 'expected a lowercase slug such as adapter:spec:slice');

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, 'expected a lowercase hex sha256');
const gitObjectSha = z.string().regex(/^([0-9a-f]{40}|[0-9a-f]{64})$/, 'expected a lowercase hex git object name');

const source = z
  .object({ adapter: nonBlank, spec_id: nonBlank, spec_path: nonBlank, spec_sha: gitObjectSha })
  .strict();

const targetTest = z.object({ file: nonBlank, name: nonBlank }).strict();

const criterion = z
  .object({
    id: z.string().regex(/^AC-\d{2,}$/, 'expected an id of the form AC-01'),
    text: nonBlank,
    verification: z.enum(['executable_test', 'deterministic_assertion', 'human_review', 'rubric']),
    target_test: targetTest.optional(),
    rubric_rationale: nonBlank.optional(),
    provenance: z.enum(['derived', 'human_authored', 'proposed']),
    source_ref: nonBlank,
  })
  .strict()
  .refine(
    (value) => value.verification !== 'executable_test' || value.target_test !== undefined,
    'executable_test criteria must name the test file and test name',
  )
  .refine(
    (value) => value.verification !== 'rubric' || value.rubric_rationale !== undefined,
    'rubric criteria must state why deterministic verification is unavailable',
  );

const contextRef = z
  .object({ uri: nonBlank, content_sha: sha256Hex, retrieved_at: z.iso.datetime(), why: nonBlank })
  .strict();

const authority = z
  .object({
    allowed: z.array(nonBlank).min(1),
    requires_human: z.array(nonBlank),
    automation_level: z.enum([
      'human-only',
      'human-approves',
      'agent-with-review',
      'agent-autonomous',
      'deterministic',
    ]),
  })
  .strict();

const decisionRef = z
  .object({ id: contractId, question: nonBlank, owner: nonBlank, deferred: z.boolean() })
  .strict();

export const consumingContractShape = z
  .object({
    id: contractId,
    title: nonBlank,
    source,
    target: nonBlank,
    scope: z.object({ include: z.array(nonBlank).min(1), exclude: z.array(nonBlank) }).strict(),
    constraints: z.array(nonBlank),
    acceptance: z.array(criterion).min(1),
    context: z.array(contextRef),
    authority,
    irreversibility: z.enum(['refactor', 'migration', 'rewrite']),
    risk: z.enum(['low', 'medium', 'high', 'critical']),
    build_wave: z.number().int().positive().optional(),
    depends_on: z.array(contractId),
    blocking_decisions: z.array(decisionRef),
  })
  .strict()
  .refine(
    (value) => new Set(value.acceptance.map((entry) => entry.id)).size === value.acceptance.length,
    'acceptance criterion ids must be unique within a contract',
  );
