import { describe, expect, it, vi } from 'vitest';

import { OllamaAdapter } from '../adapters/ollama.ts';
import { ModelPortError, type ModelRequest } from '../ports/model.ts';

function request(): ModelRequest {
  return {
    messages: [{ role: 'user', content: 'There are no blocking decisions.' }],
    draft: { title: 'Example' },
    focus: {
      ruleId: 'blocking-decisions-declared',
      slot: 'blockingDecisions',
      question: 'Which decisions are still open and block this work? An empty list is an answer.',
      entitlement: 'requester',
      authorship: 'human_confirms',
      consequence: 'routine',
      valueSchema: { type: 'array' },
      message: 'blockingDecisions must be explicitly declared',
    },
    drafted: ['constraints'],
    missing: [{
      ruleId: 'blocking-decisions-declared',
      slot: 'blockingDecisions',
      question: 'Which decisions are still open and block this work? An empty list is an answer.',
      entitlement: 'requester',
      authorship: 'human_confirms',
      consequence: 'routine',
      valueSchema: { type: 'array' },
      message: 'blockingDecisions must be explicitly declared',
    }],
  };
}

function reply(extra: Record<string, unknown>): Response {
  return new Response(JSON.stringify({
    message: { content: JSON.stringify({ assistantMessage: 'Understood.', answers: [], proposals: [] }) },
    prompt_eval_count: 100,
    ...extra,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('Ollama model adapter', () => {
  it('translates the neutral request to schema-constrained local chat', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(reply({
      message: {
        content: JSON.stringify({
          assistantMessage: 'No blocking decisions recorded.',
          answers: [{
            ruleId: 'blocking-decisions-declared',
            slot: 'blockingDecisions',
            value: [],
          }],
          proposals: [],
        }),
      },
    }));
    const adapter = new OllamaAdapter({ model: 'local-model', fetch: fetchMock });

    await expect(adapter.complete(request())).resolves.toEqual({
      assistantMessage: 'No blocking decisions recorded.',
      answers: [{
        ruleId: 'blocking-decisions-declared',
        slot: 'blockingDecisions',
        value: [],
      }],
      proposals: [],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual(expect.objectContaining({
      model: 'local-model',
      stream: false,
      think: false,
      keep_alive: '10m',
      format: expect.objectContaining({ type: 'object' }),
      options: expect.objectContaining({ temperature: 0, num_predict: 1024 }),
    }));
    expect(JSON.stringify(body)).toContain('blocking-decisions-declared');
    expect(JSON.stringify(body)).toContain('blockingDecisions');
    expect(JSON.stringify(body)).toContain('slotsAlreadyDrafted');
    expect(JSON.stringify(body)).toContain('focusGap');
    // A drafted value in view anchors a small model onto it: the same turn that
    // reported four column mappings returned one when the draft was included.
    expect(JSON.stringify(body)).not.toContain('the requester named no constraints');
    expect(JSON.stringify(body)).toContain('Never claim that a specification is complete or sealed');
    expect(JSON.stringify(body)).toContain('Do not fill unrelated gaps with generic defaults');
    expect(JSON.stringify(body)).toContain('corrects a pending proposal');
    expect(JSON.stringify(body)).toContain('Missing information is not an explicit empty list');
    expect(JSON.stringify(body)).toContain('preserve every item separately');
    expect(JSON.stringify(body)).toContain('slotsAlreadyDrafted name gaps that already hold a draft');
    expect(JSON.stringify(body['format'])).not.toContain('assistantMessage');
  });

  it('refuses an unavailable runtime', async () => {
    const adapter = new OllamaAdapter({
      model: 'local-model',
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    });
    await expect(adapter.complete(request())).rejects.toMatchObject({
      failure: 'unavailable',
    } satisfies Partial<ModelPortError>);
  });

  it('reports a model deadline separately from an offline runtime', async () => {
    const adapter = new OllamaAdapter({
      model: 'local-model',
      timeoutMs: 5,
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new DOMException('expired', 'TimeoutError')),
    });
    await expect(adapter.complete(request())).rejects.toMatchObject({
      failure: 'timed_out',
    } satisfies Partial<ModelPortError>);
  });

  it('uses an explicit output budget when the deployment overrides it', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(reply({}));
    const adapter = new OllamaAdapter({
      model: 'local-model',
      maxOutputTokens: 73,
      fetch: fetchMock,
    });
    await adapter.complete(request());
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      options: { num_predict: number };
    };
    expect(body.options.num_predict).toBe(73);
  });

  /*
   * A runtime whose window cannot hold the prompt drops the oldest tokens and
   * answers anyway, HTTP 200. Measured against qwen3.5:2b: a 33 KB conversation
   * reported prompt_eval_count=25 and produced a confident wrong answer. The
   * window must therefore be declared, not inherited.
   */
  it('declares a context window large enough to hold the reply it asks for', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(reply({ prompt_eval_count: 100 }));
    await new OllamaAdapter({ model: 'local-model', fetch: fetchMock }).complete(request());
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      options: { num_ctx: number; num_predict: number };
    };
    expect(body.options.num_ctx).toBeGreaterThan(body.options.num_predict);
  });

  it('refuses a window too small for its own output budget', () => {
    expect(() => new OllamaAdapter({ model: 'local-model', contextTokens: 512, maxOutputTokens: 4096 }))
      .toThrow(ModelPortError);
  });

  /*
   * Fail-closed: a reply generated while the window was overrun is a reply to a
   * conversation the runtime had already discarded, not a translation of it.
   */
  it('refuses a reply the runtime could not have generated inside its window', async () => {
    const adapter = new OllamaAdapter({
      model: 'local-model',
      contextTokens: 4096,
      maxOutputTokens: 4000,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(reply({ prompt_eval_count: 200 })),
    });
    await expect(adapter.complete(request())).rejects.toMatchObject({
      failure: 'context_exceeded',
    } satisfies Partial<ModelPortError>);
  });

  it('refuses a runtime that will not say how much of the prompt it read', async () => {
    const adapter = new OllamaAdapter({
      model: 'local-model',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(reply({ prompt_eval_count: undefined })),
    });
    await expect(adapter.complete(request())).rejects.toMatchObject({
      failure: 'context_exceeded',
    } satisfies Partial<ModelPortError>);
  });

  it('asks for a split verdict under the same window and refusal rules', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(reply({
      message: { content: JSON.stringify({ verdict: 'keep', because: 'the criteria depend on each other' }) },
    }));
    const adapter = new OllamaAdapter({ model: 'local-model', fetch: fetchMock });

    await expect(adapter.splitIntent({
      intent: {
        id: 'INT-01',
        title: 'Bounded intent',
        authored_by: 'sam',
        criteria: [{ id: 'AC-01', text: 'A user can export invoices.', target: 'example/repository' }],
      },
    })).resolves.toEqual({ verdict: 'keep', because: 'the criteria depend on each other' });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as Record<string, unknown>;
    expect(JSON.stringify(body)).toContain('AC-01');
    expect(JSON.stringify(body)).toContain('dependence, not count');
    expect(body['options']).toEqual(expect.objectContaining({ num_ctx: expect.any(Number) }));
  });

  it('refuses a split verdict the runtime generated past its window', async () => {
    const adapter = new OllamaAdapter({
      model: 'local-model',
      contextTokens: 4096,
      maxOutputTokens: 4000,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(reply({ prompt_eval_count: 200 })),
    });
    await expect(adapter.splitIntent({
      intent: {
        id: 'INT-01',
        title: 'Bounded intent',
        authored_by: 'sam',
        criteria: [{ id: 'AC-01', text: 'A user can export invoices.', target: 'example/repository' }],
      },
    })).rejects.toMatchObject({ failure: 'context_exceeded' } satisfies Partial<ModelPortError>);
  });

  it('refuses an unevaluable model envelope', async () => {
    const adapter = new OllamaAdapter({
      model: 'local-model',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('{not-json}', { status: 200 })),
    });
    await expect(adapter.complete(request())).rejects.toMatchObject({
      failure: 'invalid_response',
    } satisfies Partial<ModelPortError>);
  });
});
