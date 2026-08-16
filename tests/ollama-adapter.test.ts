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
      question: 'Were blocking decisions considered, and which decisions remain?',
      entitlement: 'requester',
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
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual(expect.objectContaining({
      model: 'local-model',
      stream: false,
      format: expect.objectContaining({ type: 'object' }),
    }));
    expect(JSON.stringify(body)).toContain('blocking-decisions-declared');
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
