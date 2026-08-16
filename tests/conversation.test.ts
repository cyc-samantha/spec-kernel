import { describe, expect, it, vi } from 'vitest';

import type { ModelPort } from '../ports/model.ts';
import { loadProjectDeclaration, type ProjectDeclaration } from '../ports/project.ts';
import { converse, type ConversationState } from '../ui/conversation.ts';
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
  return { draft, messages: [], attempts: [], answers: [] };
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
      assistantMessage: 'I recorded the boundary and open-decision state.',
      answers: [
        { ruleId: 'required-slots', slot: 'scope.exclude', value: ['generated/**'] },
        { ruleId: 'required-slots', slot: 'constraints', value: ['keep the wire format stable'] },
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
      prompt: 'That did not answer the question I asked. Were blocking decisions considered, and which decisions remain?',
    }));
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
      state: expect.objectContaining({ draft: {} }),
    }));
  });
});
