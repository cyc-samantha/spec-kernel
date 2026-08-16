import { describe, expect, it, vi } from 'vitest';

import { OllamaAdapter } from '../adapters/ollama.ts';
import { ModelPortError, type ModelRequest } from '../ports/model.ts';

function request(): ModelRequest {
  return {
    messages: [{ role: 'user', content: 'There are no blocking decisions.' }],
    draft: { title: 'Example' },
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

describe('Ollama model adapter', () => {
  it('translates the neutral request to schema-constrained local chat', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
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
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
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
      options: { temperature: 0, num_predict: 4096 },
    }));
    expect(JSON.stringify(body)).toContain('blocking-decisions-declared');
    expect(JSON.stringify(body)).toContain('blockingDecisions');
    expect(JSON.stringify(body)).toContain('Never move a draft into answers yourself');
    expect(JSON.stringify(body)).toContain('Never claim that a specification is complete or sealed');
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
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify({ assistantMessage: 'No answer.', answers: [] }) },
    }), { status: 200 }));
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
