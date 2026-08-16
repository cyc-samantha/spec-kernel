import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { advanceInterview, type InterviewAttempt } from '../kernel/interview.ts';
import { loadProjectDeclaration, type ProjectDeclaration } from '../ports/project.ts';

const GOLDEN = join(import.meta.dirname, '../examples/engineer-draft.output.json');

function golden(): Record<string, unknown> {
  return JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, unknown>;
}

function project(): ProjectDeclaration {
  const loaded = loadProjectDeclaration({
    version: 1,
    target_repository: 'example/repository',
    slot_entitlements: {
      requester: ['requester@example.test'],
      technical_author: ['engineer@example.test'],
    },
    signing_identity: 'maintainer@example.test',
  });
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems));
  return loaded.declaration;
}

describe('the elicit-first path', () => {
  it('stops when seal-check reaches zero and has the same output shape as assert-first', () => {
    const specification = golden();
    expect(advanceInterview(specification, project())).toEqual({
      status: 'sealed',
      successful: true,
      specification,
    });
  });

  /*
   * A live requester answered "what can answer in irreversibility" and was
   * asked the same question again. The three values it admits are in the rule's
   * own schema; a person who cannot see them is being asked to guess.
   */
  it('lists the values a gap admits when its schema names them', () => {
    const draft = golden();
    delete draft['irreversibility'];
    const step = advanceInterview(draft, project());

    expect(step).toMatchObject({ status: 'ask' });
    expect((step as { prompt: string }).prompt).toContain('one of: refactor, migration, rewrite');
  });

  /** A gap whose schema names nothing is asked as its rule wrote it. */
  it('adds no choices to a gap that admits any value', () => {
    const draft = golden();
    delete draft['constraints'];
    const step = advanceInterview(draft, project()) as { prompt: string; missing: { question: string } };

    expect(step.prompt).toBe(step.missing.question);
  });

  it('asks the question carried by the missing rule', () => {
    const draft = golden();
    delete draft['blockingDecisions'];
    const step = advanceInterview(draft, project());
    expect(step).toEqual(expect.objectContaining({
      status: 'ask',
      missing: expect.objectContaining({ ruleId: 'blocking-decisions-declared' }),
    }));
    if (step.status !== 'ask') throw new Error('expected a question');
    expect(step.prompt).toBe(step.missing.question);
  });

  it('says a response did not answer before repeating the same gap', () => {
    const draft = golden();
    delete draft['blockingDecisions'];
    const first = advanceInterview(draft, project());
    if (first.status !== 'ask') throw new Error('expected a question');
    const attempts: InterviewAttempt[] = [{
      ruleId: first.missing.ruleId,
      slot: first.missing.slot,
      wording: first.prompt,
      yieldedNewInformation: false,
    }];
    const second = advanceInterview(draft, project(), attempts);
    expect(second).toEqual(expect.objectContaining({
      status: 'ask',
      prompt: expect.stringContaining('I still do not have a value for this.'),
    }));
  });

  it('turns two fruitless attempts at one rule and slot into a blocking decision', () => {
    const draft = golden();
    delete draft['blockingDecisions'];
    const attempts: InterviewAttempt[] = [
      {
        ruleId: 'blocking-decisions-declared',
        slot: 'blockingDecisions',
        wording: 'Are any decisions open?',
        yieldedNewInformation: false,
      },
      {
        ruleId: 'blocking-decisions-declared',
        slot: 'blockingDecisions',
        wording: 'What remains undecided?',
        yieldedNewInformation: false,
      },
    ];
    expect(advanceInterview(draft, project(), attempts)).toEqual({
      status: 'blocking_decision',
      decision: expect.objectContaining({ owner: 'requester@example.test', deferred: false }),
    });
  });

  it('ends successfully when only technical completion remains', () => {
    const draft = golden();
    const acceptance = draft['acceptance'] as Record<string, unknown>[];
    delete acceptance[1]?.['targetTest'];
    expect(advanceInterview(draft, project())).toEqual(expect.objectContaining({
      status: 'awaiting_technical_completion',
      successful: true,
      missing: [expect.objectContaining({ ruleId: 'executable-test-target' })],
    }));
  });

  it('refuses input it cannot evaluate', () => {
    const draft = new Proxy({}, { get: () => { throw new Error('unreadable'); } });
    expect(advanceInterview(draft, project())).toEqual({
      status: 'refused',
      reason: 'the draft could not be evaluated safely',
    });
  });
});
