/**
 * The boundary where a sealed specification becomes a contract a team can claim.
 *
 * This is the half of D1 that had never been built. Until it existed, the
 * repository's output was measured against the execution layer (L3), which
 * accepts unknown keys — so it passed, and nobody noticed that the ticket layer
 * in between refuses the same document on ten counts: it is `.strict()`, it is
 * snake_case, and it requires four things this layer does not produce.
 *
 * It is a port, not kernel (D45). The shape below is a fact about the layer that
 * consumes contracts, and the kernel holds the universal minimum only.
 *
 * What travels and what does not (D44): the contract carries `source` and a
 * per-criterion `source_ref` that resolve back to the sealed document. The human
 * spec and the authorship trace stay here, in what was signed. A contract is what
 * an execution layer needs in order to do the work, not the record of how the
 * work came to be agreed.
 */
import { sealCheck } from '../kernel/seal-check.ts';
import { specificationSchema, type Specification } from '../kernel/specification.ts';

/** Where the sealed document lives, so the contract can point back at it (D44). */
export interface SpecificationOrigin {
  /** Path within the repository that owns the specification. */
  path: string;
  /** The git object name of the document at projection time. */
  sha: string;
}

export interface ProjectedTargetTest {
  file: string;
  name: string;
}

export interface ProjectedCriterion {
  id: string;
  text: string;
  verification: string;
  provenance: string;
  source_ref: string;
  target_test?: ProjectedTargetTest;
  rubric_rationale?: string;
}

export interface ProjectedContract {
  id: string;
  title: string;
  source: { adapter: string; spec_id: string; spec_path: string; spec_sha: string };
  target: string;
  scope: { include: string[]; exclude: string[] };
  constraints: string[];
  acceptance: ProjectedCriterion[];
  context: { uri: string; content_sha: string; retrieved_at: string; why: string }[];
  authority: { allowed: string[]; requires_human: string[]; automation_level: string };
  irreversibility: string;
  risk: string;
  depends_on: string[];
  blocking_decisions: { id: string; question: string; owner: string; deferred: boolean }[];
}

export type ContractProjection =
  | { ok: true; contract: ProjectedContract }
  | { ok: false; problems: string[] };

export const CONTRACT_ADAPTER = 'spec-kernel';

const CRITERION_ID = /^AC-\d{2,}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const GIT_OBJECT = /^([0-9a-f]{40}|[0-9a-f]{64})$/;

/*
 * An id has to survive a URL, a branch name, and a filename downstream, so the
 * consuming layer accepts lowercase segments joined by `-` or `:` and nothing
 * else. Slugifying here rather than asking a requester to type a slug keeps a
 * downstream serialisation rule out of the interview.
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function contractId(specificationId: string): string {
  return `${CONTRACT_ADAPTER}:${slugify(specificationId)}`;
}

/*
 * A derived criterion points at the human claim it proves; a human-authored one
 * is its own source. Either way the reference resolves inside the sealed
 * document, which is where the authorship trace stayed (D44).
 */
function sourceRef(specification: Specification, criterion: Specification['acceptance'][number]): string {
  const parent = 'derivedFrom' in criterion && criterion.derivedFrom ? criterion.derivedFrom : criterion.id;
  return `${specification.id}#${parent}`;
}

function projectCriterion(
  specification: Specification,
  criterion: Specification['acceptance'][number],
): ProjectedCriterion {
  return {
    id: criterion.id,
    text: criterion.text,
    verification: criterion.verification,
    provenance: criterion.provenance,
    source_ref: sourceRef(specification, criterion),
    ...(criterion.targetTest ? { target_test: { ...criterion.targetTest } } : {}),
    ...(criterion.rubricRationale ? { rubric_rationale: criterion.rubricRationale } : {}),
  };
}

/*
 * A decision the document already answers is not blocking, and handing it over
 * as one would stall the work on a question somebody has settled. A deferred
 * decision is the opposite and explicit judgement — open, owned, proceed anyway
 * — which is exactly what the consuming layer means by the word.
 */
function openDecisions(specification: Specification): ProjectedContract['blocking_decisions'] {
  return specification.blockingDecisions
    .filter((decision) => decision.deferred)
    .map((decision) => ({
      id: slugify(decision.id),
      question: decision.question,
      owner: decision.owner,
      deferred: true,
    }));
}

/*
 * Every refusal below names something the projection cannot invent. Renaming a
 * criterion to fit the downstream pattern would break the reference that makes
 * the trace worth keeping, and stamping a hash or a permission the document does
 * not carry is the fail-open this boundary exists to prevent.
 */
function unprojectable(specification: Specification, origin: SpecificationOrigin): string[] {
  const problems: string[] = [];
  if (!GIT_OBJECT.test(origin.sha)) {
    problems.push(`the origin sha is not a git object name: ${origin.sha}`);
  }
  if (origin.path.trim().length === 0) problems.push('the origin path is blank');
  if (specification.authority.allowed.length === 0) {
    problems.push('a contract must name at least one thing an agent may do; this document names none');
  }
  for (const criterion of specification.acceptance) {
    if (!CRITERION_ID.test(criterion.id)) {
      problems.push(`criterion id ${criterion.id} cannot be projected: expected the form AC-01`);
    }
  }
  for (const reference of specification.context) {
    if (!SHA256_HEX.test(reference.contentSha)) {
      problems.push(`context ${reference.uri} carries no lowercase sha256 content hash`);
    }
  }
  return problems;
}

/**
 * Projects a sealed specification into the contract the ticket layer queues.
 *
 * Refuses anything `sealCheck` has not admitted. A projection is the last place a
 * document is read before it becomes work, and one that projects an unsealed
 * draft turns every rule upstream of it into a suggestion.
 */
export function projectContract(specification: unknown, origin: SpecificationOrigin): ContractProjection {
  const sealed = specificationSchema.safeParse(specification);
  if (!sealed.success) return { ok: false, problems: ['the document is not a specification'] };

  const missing = sealCheck(sealed.data);
  if (missing.length > 0) {
    return { ok: false, problems: missing.map((item) => `${item.slot ?? item.ruleId}: ${item.message}`) };
  }

  const problems = unprojectable(sealed.data, origin);
  if (problems.length > 0) return { ok: false, problems };

  return { ok: true, contract: contractOf(sealed.data, origin) };
}

function contractOf(specification: Specification, origin: SpecificationOrigin): ProjectedContract {
  return {
    id: contractId(specification.id),
    title: specification.title,
    source: {
      adapter: CONTRACT_ADAPTER,
      spec_id: specification.id,
      spec_path: origin.path,
      spec_sha: origin.sha,
    },
    target: specification.target,
    scope: { include: [...specification.scope.include], exclude: [...specification.scope.exclude] },
    constraints: [...specification.constraints],
    acceptance: specification.acceptance.map((criterion) => projectCriterion(specification, criterion)),
    context: specification.context.map((reference) => ({
      uri: reference.uri,
      content_sha: reference.contentSha,
      retrieved_at: reference.retrievedAt,
      why: reference.why,
    })),
    authority: {
      allowed: [...specification.authority.allowed],
      requires_human: [...specification.authority.requiresHuman],
      automation_level: specification.authority.automationLevel,
    },
    irreversibility: specification.irreversibility,
    risk: specification.risk,
    depends_on: specification.dependsOn.map(contractId),
    blocking_decisions: openDecisions(specification),
  };
}
