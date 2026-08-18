/**
 * The check that did not exist: is what leaves this repository admitted by the
 * layer that consumes it?
 *
 * It was never asked before S19c. The finish line named in the ledger was the
 * execution layer, which accepts unknown keys — so the golden document passed
 * there and was refused on ten counts by the ticket layer in between, which is
 * the one that actually queues the work.
 */
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { projectContract, type SpecificationOrigin } from '../ports/contract.ts';

import { consumingContractShape } from './fixtures/consuming-contract-shape.ts';
import { validSpecification } from './fixtures/valid-specification.ts';

const ORIGIN: SpecificationOrigin = {
  path: 'specs/export-rejection.json',
  sha: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
};

function projectedOrThrow(specification: unknown) {
  const projection = projectContract(specification, ORIGIN);
  if (!projection.ok) throw new Error(projection.problems.join('; '));
  return projection.contract;
}

async function goldenExample(): Promise<unknown> {
  const path = new URL('../examples/engineer-draft.output.json', import.meta.url);
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

describe('the contract a sealed document projects to', () => {
  it('is admitted by the shape the consuming layer enforces', () => {
    const parsed = consumingContractShape.safeParse(projectedOrThrow(validSpecification()));
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it('admits the golden example, which is what the repository ships as sealed', async () => {
    const parsed = consumingContractShape.safeParse(projectedOrThrow(await goldenExample()));
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it('points back at the document it came from, rather than carrying it', () => {
    const contract = projectedOrThrow(validSpecification());
    expect(contract.source).toEqual({
      adapter: 'spec-kernel',
      spec_id: 'WC-0001',
      spec_path: ORIGIN.path,
      spec_sha: ORIGIN.sha,
    });
    expect(contract.acceptance.map((criterion) => criterion.source_ref)).toEqual(['WC-0001#AC-01', 'WC-0001#AC-01']);
  });

  /*
   * A derived criterion's reference resolves to the human claim it proves, not
   * to itself. That is the whole value of keeping the trace: "which requirement
   * is this test for" has to be answerable from the contract alone, and the two
   * criteria in the fixture answer it with the same claim.
   */
  it('traces a second derived criterion to the same parent claim', () => {
    const specification = validSpecification();
    specification.acceptance.push({
      id: 'AC-03',
      text: 'The rejection is logged once',
      verification: 'executable_test',
      targetTest: { file: 'tests/export.test.ts', name: 'logs one rejection' },
      provenance: 'derived',
      derivedFrom: 'AC-01',
    });
    const contract = projectedOrThrow(specification);
    expect(contract.acceptance[2]?.source_ref).toBe('WC-0001#AC-01');
  });

  it('gives the contract a slug the consuming layer can put in a branch name', () => {
    expect(projectedOrThrow(validSpecification()).id).toBe('spec-kernel:wc-0001');
  });

  /*
   * A decision the document answers is not blocking. Handing it over as one
   * stalls the work on a question somebody already settled, and the consuming
   * layer has no way to learn the answer from the contract.
   */
  it('carries the decisions still open and drops the ones already answered', () => {
    const specification = validSpecification();
    specification.blockingDecisions = [
      { id: 'D-01', question: 'Which error code?', owner: 'platform', deferred: false, answer: '422' },
      { id: 'D-02', question: 'Do we log the payload?', owner: 'security', deferred: true },
    ];
    expect(projectedOrThrow(specification).blocking_decisions).toEqual([
      { id: 'd-02', question: 'Do we log the payload?', owner: 'security', deferred: true },
    ]);
  });
});

/*
 * The projection is a gate: it is the last read of a document before it becomes
 * work. Both tests the contract requires are here — one goes red if the
 * seal-check line is removed, and one feeds an input the gate cannot evaluate.
 */
describe('the projection refuses what it cannot honestly project', () => {
  it('refuses a document no rule has admitted', () => {
    const specification = validSpecification();
    specification.acceptance[0]!.provenance = 'proposed';
    const projection = projectContract(specification, ORIGIN);
    expect(projection.ok).toBe(false);
    expect(projection.ok ? [] : projection.problems.join(' ')).toContain('not yet a human requirement');
  });

  it('refuses an input it cannot read as a document at all', () => {
    for (const input of [undefined, null, 'a specification', {}, []]) {
      expect(projectContract(input, ORIGIN).ok).toBe(false);
    }
  });

  it('refuses an origin sha that names no git object, rather than passing it on', () => {
    const projection = projectContract(validSpecification(), { path: 'specs/x.json', sha: 'HEAD' });
    expect(projection.ok ? [] : projection.problems).toEqual([expect.stringContaining('git object name')]);
  });

  /*
   * Renaming a criterion to fit the downstream pattern would satisfy the schema
   * and break the reference that makes the trace worth keeping. Refusing puts
   * the choice back with whoever named it.
   */
  it('refuses a criterion id it would have to rename', () => {
    const specification = validSpecification();
    specification.acceptance[0]!.id = 'first';
    specification.acceptance[1]!.derivedFrom = 'first';
    const projection = projectContract(specification, ORIGIN);
    expect(projection.ok ? [] : projection.problems).toEqual([expect.stringContaining('cannot be projected')]);
  });

  it('refuses a contract that names nothing an agent may do', () => {
    const specification = validSpecification();
    specification.authority.allowed = [];
    const projection = projectContract(specification, ORIGIN);
    expect(projection.ok ? [] : projection.problems).toEqual([expect.stringContaining('at least one thing')]);
  });
});
