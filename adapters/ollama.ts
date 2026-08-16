import { ModelPortError, type ModelPort, type ModelRequest } from '../ports/model.ts';

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_KEEP_ALIVE = '10m';
const MAX_RESPONSE_BYTES = 1024 * 1024;

const valueEntry = {
  type: 'object',
  properties: {
    ruleId: { type: 'string', minLength: 1 },
    slot: { type: 'string', minLength: 1 },
    value: {},
  },
  required: ['ruleId', 'slot', 'value'],
  additionalProperties: false,
} as const;

const proposalFormat = {
  type: 'object',
  properties: {
    assistantMessage: { type: 'string', minLength: 1 },
    answers: { type: 'array', maxItems: 64, items: valueEntry },
    proposals: {
      type: 'array',
      maxItems: 64,
      items: {
        ...valueEntry,
        properties: { ...valueEntry.properties, reason: { type: 'string', minLength: 1 } },
        required: ['ruleId', 'slot', 'value', 'reason'],
      },
    },
  },
  required: ['assistantMessage', 'answers', 'proposals'],
  additionalProperties: false,
} as const;

const systemPrompt = `You turn a human conversation into structured values for deterministic Rule gaps.
Each supplied gap carries its own question and its own valueSchema. Copy its ruleId and slot exactly.
Produce the exact JSON type and shape that gap's valueSchema requires.

answers: gaps the human actually answered or explicitly confirmed. Use only facts they stated.
proposals: your own draft for gaps they did not answer, each with a short reason naming what in the
conversation it rests on. A draft is a suggestion for a person to accept or correct, never an answer.
Draft every gap you can reasonably infer; leave a gap out of both lists when you have nothing to go on.
Never move a draft into answers yourself. Never invent identifiers, file paths, or test names.

assistantMessage briefly says what you understood and what you drafted; do not ask another question.
Never claim that a specification is complete or sealed.`;

export interface OllamaAdapterOptions {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetch?: typeof fetch;
}

function chatEndpoint(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ModelPortError('unavailable', 'the model base URL is invalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ModelPortError('unavailable', 'the model base URL must use HTTP');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/chat`;
  url.search = '';
  url.hash = '';
  return url;
}

async function responseText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new ModelPortError('invalid_response', 'the model response is too large');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new ModelPortError('invalid_response', 'the model response is too large');
  }
  return text;
}

/** Provider adapter only: it translates the neutral port to Ollama's local API. */
export class OllamaAdapter implements ModelPort {
  readonly #endpoint: URL;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #maxOutputTokens: number;
  readonly #fetch: typeof fetch;

  constructor(options: OllamaAdapterOptions) {
    if (!options.model.trim()) throw new ModelPortError('unavailable', 'a model name is required');
    if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)) {
      throw new ModelPortError('unavailable', 'the model timeout must be a positive integer');
    }
    if (
      options.maxOutputTokens !== undefined
      && (!Number.isInteger(options.maxOutputTokens) || options.maxOutputTokens < 1)
    ) {
      throw new ModelPortError('unavailable', 'the model output budget must be a positive integer');
    }
    this.#endpoint = chatEndpoint(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#model = options.model;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    this.#fetch = options.fetch ?? fetch;
  }

  async complete(request: ModelRequest): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(this.#timeoutMs),
        body: JSON.stringify({
          model: this.#model,
          stream: false,
          think: false,
          keep_alive: DEFAULT_KEEP_ALIVE,
          format: proposalFormat,
          options: { temperature: 0, num_predict: this.#maxOutputTokens },
          messages: [
            { role: 'system', content: systemPrompt },
            ...request.messages,
            {
              role: 'system',
              content: JSON.stringify({ currentDraft: request.draft, gaps: request.missing }),
            },
          ],
        }),
      });
    } catch (error) {
      if (error instanceof ModelPortError) throw error;
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new ModelPortError('timed_out', 'the model runtime exceeded its deadline');
      }
      throw new ModelPortError('unavailable', 'the model runtime could not be reached');
    }

    if (!response.ok) {
      throw new ModelPortError('unavailable', `the model runtime returned HTTP ${response.status}`);
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(await responseText(response)) as unknown;
    } catch (error) {
      if (error instanceof ModelPortError) throw error;
      throw new ModelPortError('invalid_response', 'the model runtime returned invalid JSON');
    }
    if (typeof envelope !== 'object' || envelope === null) {
      throw new ModelPortError('invalid_response', 'the model runtime returned an invalid envelope');
    }
    const message = (envelope as Record<string, unknown>)['message'];
    const content = typeof message === 'object' && message !== null
      ? (message as Record<string, unknown>)['content']
      : undefined;
    if (typeof content !== 'string') {
      throw new ModelPortError('invalid_response', 'the model runtime returned no message content');
    }
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new ModelPortError('invalid_response', 'the model message was not structured JSON');
    }
  }
}
