import { describe, expect, it, vi } from 'vitest';

import { ModelPortError, type ModelPort } from '../ports/model.ts';
import { loadProjectDeclaration, type ProjectDeclaration } from '../ports/project.ts';
import { sealCheck } from '../kernel/seal-check.ts';
import { confirmProposals, converse, type ConversationState } from '../ui/conversation.ts';
import { validSpecification } from './fixtures/valid-specification.ts';

function project(): ProjectDeclaration {
  const loaded = loadProjectDeclaration({
    version: 1,
    target_repository: 'example/repository',
    slot_entitlements: {
      requester: ['local-user'],
      technical_author: ['local-user'],
    },
    signing_identity: 'local-user',
  });
  if (!loaded.ok) throw new Error('invalid fixture');
  return loaded.declaration;
}

function state(draft: unknown): ConversationState {
  return { draft, messages: [], attempts: [], answers: [], proposals: [] };
}

function responses(...items: unknown[]): ModelPort {
  let index = 0;
  return { complete: async () => items[index++] };
}

describe('conversational specification intake', () => {
  it('applies an entitled human answer and seals only after the deterministic check is clear', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const result = await converse(
      state(draft),
      project(),
      'local-user',
      'There are no blocking decisions.',
      responses({
        assistantMessage: 'No blocking decisions recorded.',
        answers: [{ ruleId: 'blocking-decisions-declared', slot: 'blockingDecisions', value: [] }],
      }),
    );

    expect(result).toEqual(expect.objectContaining({ status: 'sealed' }));
    expect(result.state.answers).toEqual([
      expect.objectContaining({ slot: 'blockingDecisions', answeredBy: 'local-user' }),
    ]);
  });

  it('extracts several currently offered gaps with one model inference', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete (draft['scope'] as Record<string, unknown>)['exclude'];
    delete draft['constraints'];
    const complete = vi.fn().mockResolvedValue({
      assistantMessage: 'I recorded the boundary and the constraint.',
      answers: [
        {
          ruleId: 'scope-bounded',
          slot: 'scope',
          value: { include: ['src/export/**'], exclude: ['generated/**'] },
        },
        { ruleId: 'constraints-declared', slot: 'constraints', value: ['keep the wire format stable'] },
      ],
    });

    const result = await converse(
      state(draft),
      project(),
      'local-user',
      'Do not touch generated files, and keep the wire format stable.',
      { complete },
    );

    expect(result.status).toBe('sealed');
    expect(result.state.answers).toHaveLength(2);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('gives each gap its own slot schema instead of asking the translator to guess shapes', async () => {
    let gaps: readonly { slot: string; valueSchema: unknown }[] = [];
    const model: ModelPort = {
      complete: async (request) => {
        gaps = request.missing;
        return { assistantMessage: 'More detail is needed.', answers: [] };
      },
    };
    await converse(state({}), project(), 'local-user', 'Build a CSV export.', model);
    const intent = gaps.find((gap) => gap.slot === 'intent');
    const risk = gaps.find((gap) => gap.slot === 'risk');
    expect(JSON.stringify(intent?.valueSchema)).toContain('"enum":["change","spike"]');
    expect(JSON.stringify(risk?.valueSchema)).toContain('"enum":["low","medium","high","critical"]');
  });

  it('never offers the translator a slot the kernel derives for itself', async () => {
    let gaps: readonly { slot: string }[] = [];
    const model: ModelPort = {
      complete: async (request) => {
        gaps = request.missing;
        return { assistantMessage: 'Understood.', answers: [] };
      },
    };
    await converse(state({}), project(), 'local-user', 'Build a CSV export.', model);
    expect(gaps.map((gap) => gap.slot)).not.toContain('target');
    expect(gaps.map((gap) => gap.slot)).not.toContain('id');
  });

  it('allows the same entitled user to complete a technical gap without changing the rule', async () => {
    const draft = validSpecification();
    delete draft.acceptance[1]!.targetTest;
    const result = await converse(
      state(draft),
      project(),
      'local-user',
      'The test is in tests/export.test.ts and is named rejects unsupported fields.',
      responses({
        assistantMessage: 'I recorded the named test.',
        answers: [{
          ruleId: 'executable-test-target',
          slot: 'acceptance.AC-02.targetTest',
          value: { file: 'tests/export.test.ts', name: 'rejects unsupported fields' },
        }],
      }),
    );

    expect(result.status).toBe('sealed');
    expect(result.state.answers[0]).toEqual(expect.objectContaining({ entitlement: 'technical_author' }));
  });

  it('hands a technical gap off when the current identity is not entitled to fill it', async () => {
    const loaded = loadProjectDeclaration({
      version: 1,
      target_repository: 'example/repository',
      slot_entitlements: {
        requester: ['requester-only'],
        technical_author: ['engineer-only'],
      },
      signing_identity: 'engineer-only',
    });
    if (!loaded.ok) throw new Error('invalid fixture');
    const draft = validSpecification();
    delete draft.acceptance[1]!.targetTest;
    const model: ModelPort = { complete: async () => { throw new Error('must not be called'); } };

    const result = await converse(
      state(draft),
      loaded.declaration,
      'requester-only',
      'Please finish the specification.',
      model,
    );

    expect(result).toEqual(expect.objectContaining({
      status: 'awaiting_handoff',
      missing: [expect.objectContaining({ entitlement: 'technical_author' })],
    }));
  });

  it('asks the same Rule-derived question when the message contains no answer', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const result = await converse(
      state(draft),
      project(),
      'local-user',
      'I am not sure.',
      responses({ assistantMessage: 'I could not find that decision in your answer.', answers: [] }),
    );

    expect(result).toEqual(expect.objectContaining({
      status: 'ask',
      missing: expect.objectContaining({ ruleId: 'blocking-decisions-declared' }),
      prompt: 'That did not answer the question I asked. Which decisions are still open and block this work? An empty list is an answer.',
    }));
  });

  it('fills a slot the project declaration already answers without asking anyone', async () => {
    const model: ModelPort = {
      complete: async () => ({ assistantMessage: 'Understood.', answers: [], proposals: [] }),
    };
    const result = await converse(state({}), project(), 'local-user', 'Build a CSV export.', model);
    expect(result.state.draft).toEqual(expect.objectContaining({ target: 'example/repository' }));
    expect(result.state.answers).toEqual([
      expect.objectContaining({ slot: 'target', source: 'derived', answeredBy: 'derivation' }),
    ]);
  });

  it('drafts an open gap instead of asking the requester to invent the value', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const result = await converse(
      state(draft),
      project(),
      'local-user',
      'Nothing else is blocked as far as I know.',
      responses({
        assistantMessage: 'I drafted the open-decision state.',
        answers: [],
        proposals: [{
          ruleId: 'blocking-decisions-declared',
          slot: 'blockingDecisions',
          value: [],
          reason: 'you said nothing else is blocked',
        }],
      }),
    );

    expect(result.status).toBe('ask');
    expect(result.state.proposals).toEqual([
      expect.objectContaining({ slot: 'blockingDecisions', reason: 'you said nothing else is blocked' }),
    ]);
  });

  it('carries pending proposals into the next model turn and does not erase them', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['constraints'];
    delete draft['blockingDecisions'];
    const seen: unknown[] = [];
    const model: ModelPort = {
      complete: async (request) => {
        seen.push(request.proposals);
        if (seen.length === 1) {
          return {
            assistantMessage: 'I drafted the remaining constraints.',
            answers: [],
            proposals: [{
              ruleId: 'constraints-declared',
              slot: 'constraints',
              value: [],
              reason: 'you named no constraints',
            }],
          };
        }
        return {
          assistantMessage: 'I recorded that no decisions remain.',
          answers: [{
            ruleId: 'blocking-decisions-declared',
            slot: 'blockingDecisions',
            value: [],
          }],
          proposals: [],
        };
      },
    };

    const first = await converse(state(draft), project(), 'local-user', 'Use the existing defaults.', model);
    const second = await converse(first.state, project(), 'local-user', 'There are no blocking decisions.', model);

    expect(seen[0]).toEqual([]);
    expect(seen[1]).toEqual([
      expect.objectContaining({ slot: 'constraints', value: [] }),
    ]);
    expect(second.state.proposals).toEqual([
      expect.objectContaining({ slot: 'constraints', value: [] }),
    ]);
  });

  /*
   * A rebuke for a gap the machine just answered for itself is the interview
   * arguing with its own draft. The requester sees a value on offer and a
   * complaint that they gave none.
   */
  it('invites confirmation of a fresh draft instead of rebuking the answer', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const result = await converse(
      state(draft),
      project(),
      'local-user',
      'Nothing else is blocked as far as I know.',
      responses({
        assistantMessage: 'I drafted the open-decision state.',
        answers: [],
        proposals: [{
          ruleId: 'blocking-decisions-declared',
          slot: 'blockingDecisions',
          value: [],
          reason: 'you said nothing else is blocked',
        }],
      }),
    );

    expect(result).toEqual(expect.objectContaining({
      status: 'ask',
      prompt: 'I drafted an answer for this. Confirm it above, or correct me here. Which decisions are still open and block this work? An empty list is an answer.',
    }));
  });

  /*
   * The translator narrates; the ledger decides. A turn that recorded nothing
   * must not carry prose claiming it understood and drafted — the requester
   * cannot tell a summary from a result.
   */
  it('drops a model summary the turn did not back with an answer or a draft', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const result = await converse(
      state(draft),
      project(),
      'local-user',
      'I am not sure.',
      responses({
        assistantMessage: 'I understood your request and drafted the remaining gaps.',
        answers: [],
        proposals: [],
      }),
    );

    expect(result.state.messages.at(-1)?.content).toBe(
      'That did not answer the question I asked. Which decisions are still open and block this work? An empty list is an answer.',
    );
  });

  it('describes progress from recorded slots instead of model narration', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const result = await converse(
      state(draft),
      project(),
      'local-user',
      'There are no blocking decisions.',
      responses({
        assistantMessage: 'I repeated an old summary about a different scope.',
        answers: [{
          ruleId: 'blocking-decisions-declared',
          slot: 'blockingDecisions',
          value: [],
        }],
        proposals: [],
      }),
    );

    expect(result.state.messages.at(-1)?.content).toBe(
      'I recorded blockingDecisions.\n\nThe deterministic seal-check now has zero gaps.',
    );
  });

  it('names the slots a confirmation recorded rather than repeating one line', () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    delete draft['constraints'];
    const carried: ConversationState = {
      ...state(draft),
      proposals: [{
        ruleId: 'constraints-declared',
        slot: 'constraints',
        question: 'q',
        value: [],
        reason: 'you named no constraint',
        consequence: 'routine',
        entitlement: 'requester',
      }],
    };
    const result = confirmProposals(carried, project(), 'local-user', ['constraints']);

    expect(result.state.messages.at(-1)?.content).toContain('I recorded constraints.');
  });

  /*
   * D10 still ends an interview that is going nowhere, but a standing draft
   * buys the requester one turn: the second sighting of the same draft is not
   * new information.
   */
  it('escalates a twice-ignored draft rather than offering it forever', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const drafted = {
      assistantMessage: 'I drafted the open-decision state.',
      answers: [],
      proposals: [{
        ruleId: 'blocking-decisions-declared',
        slot: 'blockingDecisions',
        value: [],
        reason: 'you said nothing else is blocked',
      }],
    };
    const model = responses(drafted, drafted, drafted);

    let carried = state(draft);
    const statuses: string[] = [];
    for (const message of ['Nothing else is blocked.', 'As I said.', 'Same answer.']) {
      const result = await converse(carried, project(), 'local-user', message, model);
      carried = result.state;
      statuses.push(result.status);
    }

    expect(statuses).toEqual(['ask', 'ask', 'blocking_decision']);
  });

  /*
   * D8: a machine may propose but may not answer its own question. A draft that
   * reached the document would let one seal-check pass content nobody authored.
   */
  it('keeps a machine draft out of the document until a person confirms it', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const result = await converse(
      state(draft),
      project(),
      'local-user',
      'Nothing else is blocked.',
      responses({
        assistantMessage: 'I drafted the open-decision state.',
        answers: [],
        proposals: [{
          ruleId: 'blocking-decisions-declared',
          slot: 'blockingDecisions',
          value: [],
          reason: 'you said nothing else is blocked',
        }],
      }),
    );

    expect(sealCheck(result.state.draft)).toEqual([
      expect.objectContaining({ ruleId: 'blocking-decisions-declared' }),
    ]);
    expect(result.state.answers).toEqual([]);
  });

  it('records a confirmed draft as the confirming person answer', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const asked = await converse(
      state(draft),
      project(),
      'local-user',
      'Nothing else is blocked.',
      responses({
        assistantMessage: 'I drafted the open-decision state.',
        answers: [],
        proposals: [{
          ruleId: 'blocking-decisions-declared',
          slot: 'blockingDecisions',
          value: [],
          reason: 'you said nothing else is blocked',
        }],
      }),
    );

    const confirmed = confirmProposals(asked.state, project(), 'local-user', ['blockingDecisions']);
    expect(confirmed.status).toBe('sealed');
    expect(confirmed.state.answers).toEqual([
      expect.objectContaining({ slot: 'blockingDecisions', answeredBy: 'local-user', source: 'human' }),
    ]);
    expect(confirmed.state.proposals).toEqual([]);
  });

  it('refuses a confirmation that names no drafted slot', () => {
    const result = confirmProposals(state({}), project(), 'local-user', []);
    expect(result).toEqual(expect.objectContaining({
      status: 'refused',
      reason: 'a confirmation must name at least one drafted slot',
    }));
  });

  it('discards a drafted value the rule that reported the gap would still refuse', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const result = await converse(
      state(draft),
      project(),
      'local-user',
      'Nothing else is blocked.',
      responses({
        assistantMessage: 'I drafted the open-decision state.',
        answers: [],
        proposals: [{
          ruleId: 'blocking-decisions-declared',
          slot: 'blockingDecisions',
          value: 'none',
          reason: 'you said nothing else is blocked',
        }],
      }),
    );

    expect(result.state.proposals).toEqual([]);
  });

  it('refuses malformed model output instead of treating it as an answer', async () => {
    const result = await converse(
      state({}),
      project(),
      'local-user',
      'Build an export screen.',
      responses({ assistantMessage: 'Done.' }),
    );
    expect(result).toEqual(expect.objectContaining({
      status: 'refused',
      reason: 'the model response did not match the proposal schema',
    }));
  });

  it('refuses an unavailable model without changing the draft', async () => {
    const initial = state({});
    const model: ModelPort = { complete: async () => { throw new Error('offline'); } };
    const result = await converse(initial, project(), 'local-user', 'Build an export screen.', model);
    expect(result).toEqual(expect.objectContaining({
      status: 'refused',
      reason: 'the configured model is unavailable',
      state: expect.objectContaining({ answers: [expect.objectContaining({ source: 'derived' })] }),
    }));
  });

  it('reports a timed-out model without calling it unavailable', async () => {
    const initial = state({});
    const model: ModelPort = {
      complete: async () => { throw new ModelPortError('timed_out', 'deadline expired'); },
    };
    const result = await converse(initial, project(), 'local-user', 'Build an export screen.', model);
    expect(result).toEqual(expect.objectContaining({
      status: 'refused',
      reason: 'the configured model request timed out',
      state: expect.objectContaining({ answers: [expect.objectContaining({ source: 'derived' })] }),
    }));
  });

  /*
   * "Unavailable" sends the requester to check a runtime that is running fine.
   * An overrun window is a different problem with a different remedy.
   */
  it('names an overrun context window rather than calling the runtime unavailable', async () => {
    const model: ModelPort = {
      complete: async () => { throw new ModelPortError('context_exceeded', 'window overrun'); },
    };
    const result = await converse(state({}), project(), 'local-user', 'Build an export screen.', model);
    expect(result).toEqual(expect.objectContaining({
      status: 'refused',
      reason: 'the conversation outgrew the configured model context window',
    }));
  });
});
