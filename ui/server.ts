import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';

import { assessDraft } from '../kernel/draft.ts';
import { advanceInterview, type InterviewAttempt } from '../kernel/interview.ts';
import { loadProjectDeclaration } from '../ports/project.ts';

const MAX_BODY_BYTES = 1024 * 1024;
const PUBLIC = new URL('./public/', import.meta.url);
const EXAMPLES = new URL('../examples/', import.meta.url);

const assets = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/app.js', { file: 'app.js', type: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { file: 'styles.css', type: 'text/css; charset=utf-8' }],
]);

function secureHeaders(response: ServerResponse): void {
  response.setHeader(
    'content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('cache-control', 'no-store');
}

function send(response: ServerResponse, status: number, type: string, body: string): void {
  secureHeaders(response);
  response.writeHead(status, { 'content-type': type });
  response.end(body);
}

function json(response: ServerResponse, status: number, body: unknown): void {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(body));
}

async function requestBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) {
      tooLarge = true;
      continue;
    }
    chunks.push(buffer);
  }
  return tooLarge ? undefined : Buffer.concat(chunks).toString('utf8');
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function validAttempts(value: unknown): value is InterviewAttempt[] {
  if (!Array.isArray(value)) return false;
  return value.every((attempt) => {
    const item = record(attempt);
    return item
      && typeof item['ruleId'] === 'string'
      && typeof item['slot'] === 'string'
      && typeof item['wording'] === 'string'
      && typeof item['yieldedNewInformation'] === 'boolean';
  });
}

async function parsedBody(request: IncomingMessage, response: ServerResponse): Promise<unknown> {
  const text = await requestBody(request);
  if (text === undefined) {
    json(response, 413, { error: 'body_too_large' });
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    json(response, 400, { error: 'invalid_json' });
    return undefined;
  }
}

async function examples(response: ServerResponse): Promise<void> {
  const [draft, project] = await Promise.all([
    readFile(new URL('engineer-draft.output.json', EXAMPLES), 'utf8'),
    readFile(new URL('harness-factory-map.project.yaml', EXAMPLES), 'utf8'),
  ]);
  json(response, 200, { draft: JSON.parse(draft), project: JSON.parse(project) });
}

async function seal(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = record(await parsedBody(request, response));
  if (!body || !Object.hasOwn(body, 'draft')) {
    if (!response.headersSent) json(response, 422, { error: 'invalid_request' });
    return;
  }
  json(response, 200, assessDraft(body['draft']));
}

async function interview(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = record(await parsedBody(request, response));
  if (!body || !Object.hasOwn(body, 'draft') || !Object.hasOwn(body, 'project')) {
    if (!response.headersSent) json(response, 422, { error: 'invalid_request' });
    return;
  }
  const project = loadProjectDeclaration(body['project']);
  if (!project.ok) {
    json(response, 422, { error: 'invalid_project', problems: project.problems });
    return;
  }
  const attempts = body['attempts'] ?? [];
  if (!validAttempts(attempts)) {
    json(response, 422, { error: 'invalid_attempts' });
    return;
  }
  json(response, 200, advanceInterview(body['draft'], project.declaration, attempts));
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/api/examples') return examples(response);
  if (request.method === 'POST' && url.pathname === '/api/seal-check') return seal(request, response);
  if (request.method === 'POST' && url.pathname === '/api/interview') return interview(request, response);

  const asset = request.method === 'GET' ? assets.get(url.pathname) : undefined;
  if (asset) {
    send(response, 200, asset.type, await readFile(new URL(asset.file, PUBLIC), 'utf8'));
    return;
  }
  json(response, 404, { error: 'not_found' });
}

/** Creates an unbound server so callers choose the loopback port and lifecycle. */
export function createUiServer(): ReturnType<typeof createServer> {
  return createServer((request, response) => {
    route(request, response).catch(() => {
      if (!response.headersSent) json(response, 500, { error: 'internal_error' });
      else response.end();
    });
  });
}
