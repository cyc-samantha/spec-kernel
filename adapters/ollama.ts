import { ModelPortError, type ModelPort, type ModelRequest } from '../ports/model.ts';

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

const proposalFormat = {
  type: 'object',
  properties: {
    answered: { type: 'boolean' },
    assistantMessage: { type: 'string', minLength: 1 },
    value: {},
  },
  required: ['answered', 'assistantMessage'],
  additionalProperties: false,
} as const;

const systemPrompt = `You translate human answers into one structured specification value.
Use only facts stated by the human in the conversation. Never invent an answer.
The supplied gap and question originate in a deterministic Rule. Answer that gap only.
If the human did not answer it, return answered=false and omit value.
If answered, return answered=true and put the exact JSON value for the supplied slot in value.
assistantMessage briefly explains what was or was not understood; do not ask another question.
Never claim that a specification is complete or sealed.`;

export interface OllamaAdapterOptions {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
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
  readonly #fetch: typeof fetch;

  constructor(options: OllamaAdapterOptions) {
    if (!options.model.trim()) throw new ModelPortError('unavailable', 'a model name is required');
    this.#endpoint = chatEndpoint(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#model = options.model;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
          format: proposalFormat,
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: systemPrompt },
            ...request.messages,
            {
              role: 'system',
              content: JSON.stringify({
                currentDraft: request.draft,
                gap: request.missing,
              }),
            },
          ],
        }),
      });
    } catch (error) {
      if (error instanceof ModelPortError) throw error;
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
