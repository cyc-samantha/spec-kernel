import { z } from 'zod';

import { specificationSchema } from './specification.ts';

const nonBlank = z.string().trim().min(1);

export const parentIntentSchema = z.object({
  id: nonBlank,
  title: nonBlank,
  authored_by: nonBlank,
  criteria: z.array(z.object({ id: nonBlank, text: nonBlank, target: nonBlank })).min(1),
});

const proposedContractSchema = z.object({
  id: nonBlank,
  title: nonBlank,
  target: nonBlank,
  source_intent: nonBlank,
  criteria: z.array(nonBlank).min(1),
  after: z.array(nonBlank),
});

export const splitProposalSchema = z.discriminatedUnion('verdict', [
  z.object({ verdict: z.literal('keep'), because: nonBlank }),
  z.object({
    verdict: z.literal('split'),
    because: nonBlank,
    contracts: z.array(proposedContractSchema).min(2),
  }),
]);

export type ParentIntent = z.infer<typeof parentIntentSchema>;
export type SplitProposal = z.infer<typeof splitProposalSchema>;

export type ParentIntentDerivation =
  | { ok: true; intent: ParentIntent }
  | { ok: false; problems: string[] };

/**
 * Derives the parent a sealed document's contracts will trace back to. The
 * author is named by the caller because the document records who answered, not
 * who is splitting it (D22); every criterion inherits the document's one target
 * (D21), so a split can only redistribute work, never retarget it.
 */
export function parentIntentFrom(specification: unknown, authoredBy: string): ParentIntentDerivation {
  const sealed = specificationSchema.safeParse(specification);
  if (!sealed.success) return { ok: false, problems: ['the document is not a sealed specification'] };
  const candidate = parentIntentSchema.safeParse({
    id: sealed.data.id,
    title: sealed.data.title,
    authored_by: authoredBy,
    criteria: sealed.data.acceptance.map((criterion) => ({
      id: criterion.id,
      text: criterion.text,
      target: sealed.data.target,
    })),
  });
  if (!candidate.success) return { ok: false, problems: ['the parent intent is incomplete'] };
  return { ok: true, intent: candidate.data };
}

export type SplitValidation =
  | { ok: true; status: 'proposed'; proposal: SplitProposal }
  | { ok: false; problems: string[] };

function duplicates(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value);
}

function cycleIn(contracts: readonly { id: string; after: string[] }[]): boolean {
  const edges = new Map(contracts.map((contract) => [contract.id, contract.after]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of edges.get(id) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return contracts.some((contract) => visit(contract.id));
}

/** Validates a split suggestion; a valid result is still only a human amendment proposal. */
export function validateSplitProposal(parentRaw: unknown, proposalRaw: unknown): SplitValidation {
  const parent = parentIntentSchema.safeParse(parentRaw);
  const proposal = splitProposalSchema.safeParse(proposalRaw);
  if (!parent.success || !proposal.success) {
    return {
      ok: false,
      problems: [
        ...(!parent.success ? parent.error.issues.map((issue) => `intent: ${issue.message}`) : []),
        ...(!proposal.success ? proposal.error.issues.map((issue) => `proposal: ${issue.message}`) : []),
      ],
    };
  }

  const targetCount = new Set(parent.data.criteria.map((criterion) => criterion.target)).size;
  if (proposal.data.verdict === 'keep') {
    if (targetCount > 1) {
      return { ok: false, problems: ['cross-repository intent must become one contract per target'] };
    }
    return { ok: true, status: 'proposed', proposal: proposal.data };
  }

  const problems: string[] = [];
  const contractIds = proposal.data.contracts.map((contract) => contract.id);
  for (const id of duplicates(contractIds)) problems.push(`contract id is not unique: ${id}`);

  const criteriaById = new Map(parent.data.criteria.map((criterion) => [criterion.id, criterion]));
  const assigned = proposal.data.contracts.flatMap((contract) => contract.criteria);
  for (const id of duplicates(assigned)) problems.push(`criterion is assigned more than once: ${id}`);
  for (const id of criteriaById.keys()) {
    if (!assigned.includes(id)) problems.push(`criterion is not assigned: ${id}`);
  }
  for (const id of assigned) {
    if (!criteriaById.has(id)) problems.push(`proposal names an unknown criterion: ${id}`);
  }

  const knownContracts = new Set(contractIds);
  for (const contract of proposal.data.contracts) {
    if (contract.source_intent !== parent.data.id) {
      problems.push(`${contract.id} does not trace to parent intent ${parent.data.id}`);
    }
    for (const criterionId of contract.criteria) {
      const criterion = criteriaById.get(criterionId);
      if (criterion && criterion.target !== contract.target) {
        problems.push(`${criterionId} targets ${criterion.target}, not ${contract.target}`);
      }
    }
    for (const dependency of contract.after) {
      if (!knownContracts.has(dependency)) problems.push(`${contract.id} follows unknown contract ${dependency}`);
      if (dependency === contract.id) problems.push(`${contract.id} cannot follow itself`);
    }
  }
  if (cycleIn(proposal.data.contracts)) problems.push('contract ordering contains a cycle');

  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, status: 'proposed', proposal: proposal.data };
}
