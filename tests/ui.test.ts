import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModelPort } from '../ports/model.ts';
import { createUiServer, type UiServerOptions } from '../ui/server.ts';
import { validSpecification } from './fixtures/valid-specification.ts';

let server: ReturnType<typeof createUiServer>;
let baseUrl: string;

async function bind(options: UiServerOptions = {}): Promise<void> {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  server = createUiServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  await bind();
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Static Web UI assets', () => {
  it('serves the specification workspace with a restrictive policy', async () => {
    const response = await fetch(baseUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    const html = await response.text();
    expect(html).toContain('RULE-DRIVEN INTERVIEW');
    expect(html).toContain('id="intent-input"');
    expect(html).not.toContain('id="draft-input"');
    expect(html).not.toContain('id="project-input"');
  });

  it('renders untrusted values as text rather than HTML', async () => {
    const script = await (await fetch(`${baseUrl}/app.js`)).text();
    expect(script).toContain('textContent');
    expect(script).not.toContain('innerHTML');
  });

  it('loads the checked-in golden draft and project declaration', async () => {
    const response = await fetch(`${baseUrl}/api/examples`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      draft: expect.objectContaining({ id: 'WC-EXAMPLE-01' }),
      project: expect.objectContaining({ version: 1 }),
    });
  });
});

describe('Conversational UI API', () => {
  it('opens with a Rule-derived prompt instead of a separately authored questionnaire', async () => {
    const response = await post('/api/conversation/start', {});
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: 'ask',
      missing: expect.objectContaining({ ruleId: 'intent-declared' }),
      prompt: 'Is this a change to the system, or a spike that produces knowledge?',
      state: expect.objectContaining({
        messages: [expect.objectContaining({
          content: expect.stringContaining('Is this a change to the system, or a spike that produces knowledge?'),
        })],
      }),
    }));
  });

  it('keeps session history on the server and seals an entitled natural-language answer', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const model: ModelPort = {
      complete: vi.fn().mockResolvedValue({
        assistantMessage: 'I recorded that no decisions remain.',
        answers: [{
          ruleId: 'blocking-decisions-declared',
          slot: 'blockingDecisions',
          value: [],
        }],
      }),
    };
    await bind({ model, modelLabel: 'Test model', initialDraft: draft });

    const started = await post('/api/conversation/start', {});
    expect(started.status).toBe(201);
    const startBody = await started.json() as { sessionId: string };
    const turn = await post('/api/conversation/turn', {
      sessionId: startBody.sessionId,
      message: 'There are no blocking decisions.',
    });

    expect(turn.status).toBe(200);
    await expect(turn.json()).resolves.toEqual(expect.objectContaining({
      status: 'sealed',
      runtime: 'Test model',
      state: expect.objectContaining({
        draft: expect.objectContaining({ blockingDecisions: [] }),
        answers: [expect.objectContaining({ answeredBy: 'local-user' })],
      }),
    }));
  });

  it('refuses an unknown session before calling the configured model', async () => {
    const complete = vi.fn();
    await bind({ model: { complete } });
    const response = await post('/api/conversation/turn', {
      sessionId: 'not-a-session',
      message: 'Build an export screen.',
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'session_not_found' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('confirms named drafts over the same session without a second inference', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    const complete = vi.fn().mockResolvedValue({
      assistantMessage: 'I drafted the open-decision state.',
      answers: [],
      proposals: [{
        ruleId: 'blocking-decisions-declared',
        slot: 'blockingDecisions',
        value: [],
        reason: 'you said nothing else is blocked',
      }],
    });
    await bind({ model: { complete } as ModelPort, initialDraft: draft });

    const started = await post('/api/conversation/start', {});
    const { sessionId } = await started.json() as { sessionId: string };
    const asked = await post('/api/conversation/turn', { sessionId, message: 'Nothing else is blocked.' });
    await expect(asked.json()).resolves.toEqual(expect.objectContaining({
      status: 'ask',
      state: expect.objectContaining({
        proposals: [expect.objectContaining({ slot: 'blockingDecisions' })],
      }),
    }));

    const confirmed = await post('/api/conversation/confirm', { sessionId, slots: ['blockingDecisions'] });
    expect(confirmed.status).toBe(200);
    await expect(confirmed.json()).resolves.toEqual(expect.objectContaining({ status: 'sealed' }));
    expect(complete).toHaveBeenCalledOnce();
  });

  it('refuses a confirmation for a session it does not hold', async () => {
    const response = await post('/api/conversation/confirm', { sessionId: 'absent', slots: ['risk'] });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_request' });
  });

  it('reports an unavailable model without changing the server-side draft', async () => {
    const model: ModelPort = { complete: async () => { throw new Error('offline'); } };
    await bind({ model });
    const started = await post('/api/conversation/start', {});
    const startBody = await started.json() as { sessionId: string };
    const response = await post('/api/conversation/turn', {
      sessionId: startBody.sessionId,
      message: 'Build an export screen.',
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: 'refused',
      reason: 'the configured model is unavailable',
      state: expect.objectContaining({ answers: [expect.objectContaining({ source: 'derived' })] }),
    }));
  });
});

describe('Static Web UI API adapter', () => {
  it('seals the golden specification through the same kernel function', async () => {
    const examples = await (await fetch(`${baseUrl}/api/examples`)).json() as { draft: unknown };
    const response = await post('/api/seal-check', { draft: examples.draft });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ status: 'sealed', missing: [] }),
    );
  });

  it('returns Rule-derived missing items and the next interview question', async () => {
    const examples = await (await fetch(`${baseUrl}/api/examples`)).json() as {
      draft: Record<string, unknown>;
      project: unknown;
    };
    delete examples.draft['blockingDecisions'];

    const checked = await post('/api/seal-check', { draft: examples.draft });
    await expect(checked.json()).resolves.toEqual(expect.objectContaining({
      status: 'incomplete',
      missing: [expect.objectContaining({ ruleId: 'blocking-decisions-declared' })],
    }));

    const advanced = await post('/api/interview', {
      draft: examples.draft,
      project: examples.project,
      attempts: [],
    });
    await expect(advanced.json()).resolves.toEqual(expect.objectContaining({
      status: 'ask',
      missing: expect.objectContaining({ ruleId: 'blocking-decisions-declared' }),
    }));
  });

  it('refuses malformed JSON rather than treating it as an empty draft', async () => {
    const response = await fetch(`${baseUrl}/api/seal-check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json}',
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_json' });
  });

  it('refuses an oversized body before it reaches the kernel', async () => {
    const response = await fetch(`${baseUrl}/api/seal-check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft: 'x'.repeat(1024 * 1024) }),
    });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'body_too_large' });
  });

  it('refuses an invalid project declaration before advancing', async () => {
    const response = await post('/api/interview', { draft: {}, project: { version: 99 } });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: 'invalid_project',
    }));
  });

  it('does not expose arbitrary filesystem paths as routes', async () => {
    const response = await fetch(`${baseUrl}/../../package.json`);
    expect(response.status).toBe(404);
  });
});

describe('checked-in UI source', () => {
  it('contains no remote script or stylesheet dependency', () => {
    const html = readFileSync(new URL('../ui/public/index.html', import.meta.url), 'utf8');
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('splitting a sealed session into claimable contracts', () => {
  async function sealedSession(splitReply: unknown): Promise<string> {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    await bind({
      initialDraft: draft,
      modelLabel: 'Test model',
      model: {
        complete: async () => ({
          assistantMessage: 'Recorded.',
          answers: [{ ruleId: 'blocking-decisions-declared', slot: 'blockingDecisions', value: [] }],
          proposals: [],
        }),
        splitIntent: async () => splitReply,
      },
    });
    const started = await post('/api/conversation/start', {});
    const { sessionId } = await started.json() as { sessionId: string };
    await post('/api/conversation/turn', { sessionId, message: 'There are no blocking decisions.' });
    return sessionId;
  }

  it('returns contracts that carry every criterion of the sealed document', async () => {
    const specification = validSpecification();
    const [first, ...rest] = specification.acceptance;
    const sessionId = await sealedSession({
      verdict: 'split',
      because: 'neither slice waits on the other',
      contracts: [
        {
          id: 'WC-A', title: 'First', target: specification.target,
          source_intent: specification.id, criteria: [first!.id], after: [],
        },
        {
          id: 'WC-B', title: 'Second', target: specification.target,
          source_intent: specification.id, criteria: rest.map((c) => c.id), after: ['WC-A'],
        },
      ],
    });

    const response = await post('/api/conversation/split', { sessionId });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: 'split',
      contracts: [
        expect.objectContaining({ id: 'WC-A' }),
        expect.objectContaining({ id: 'WC-B', after: ['WC-A'] }),
      ],
    }));
  });

  /*
   * Fail-closed: a deployment whose adapter cannot split must not receive a
   * division from somewhere else.
   */
  it('refuses to split when the configured runtime has no split capability', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    await bind({ initialDraft: draft, model: { complete: async () => ({}) } });
    const started = await post('/api/conversation/start', {});
    const { sessionId } = await started.json() as { sessionId: string };

    const response = await post('/api/conversation/split', { sessionId });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: 'split_unsupported' });
  });

  it('refuses to split a session that has not sealed', async () => {
    const draft = validSpecification() as unknown as Record<string, unknown>;
    delete draft['blockingDecisions'];
    await bind({
      initialDraft: draft,
      model: { complete: async () => ({}), splitIntent: async () => ({ verdict: 'keep', because: 'x' }) },
    });
    const started = await post('/api/conversation/start', {});
    const { sessionId } = await started.json() as { sessionId: string };

    const response = await post('/api/conversation/split', { sessionId });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ status: 'refused' }));
  });

  it('refuses an unknown session', async () => {
    await bind({ model: { complete: async () => ({}), splitIntent: async () => ({}) } });
    const response = await post('/api/conversation/split', { sessionId: 'not-a-session' });
    expect(response.status).toBe(404);
  });
});
