import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createUiServer } from '../ui/server.ts';

let server: ReturnType<typeof createUiServer>;
let baseUrl: string;

beforeEach(async () => {
  server = createUiServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
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
    expect(html).toContain('Specification workspace');
    expect(html).toContain('id="draft-input"');
    expect(html).toContain('id="project-input"');
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
