import {
  ModelPortError,
  type ModelPort,
  type ModelRequest,
  type SplitPort,
  type SplitRequest,
} from '../ports/model.ts';

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT_MS = 300_000;
// One turn translates bounded slot values, not a document-sized answer. Keep
// this aligned with README so a small local model cannot spend minutes filling
// an output budget the application neither needs nor displays.
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
/*
 * Ollama defaults this to 4096 and silently drops whatever does not fit — a
 * 33 KB conversation came back as prompt_eval_count=25 with a confident wrong
 * answer. The window is declared here so the gate below has a number to check.
 */
const DEFAULT_CONTEXT_TOKENS = 16_384;
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
    answers: { type: 'array', maxItems: 2, items: valueEntry },
    proposals: {
      type: 'array',
      maxItems: 2,
      items: {
        ...valueEntry,
        properties: { ...valueEntry.properties, reason: { type: 'string', minLength: 1 } },
        required: ['ruleId', 'slot', 'value', 'reason'],
      },
    },
  },
  required: ['answers', 'proposals'],
  additionalProperties: false,
} as const;

const splitFormat = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['keep', 'split'] },
    because: { type: 'string', minLength: 1 },
    contracts: {
      type: 'array',
      maxItems: 32,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
          source_intent: { type: 'string', minLength: 1 },
          criteria: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
          after: { type: 'array', items: { type: 'string', minLength: 1 } },
        },
        required: ['id', 'title', 'target', 'source_intent', 'criteria', 'after'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdict', 'because'],
  additionalProperties: false,
} as const;

const splitPrompt = `You divide one sealed intent into the smallest number of contracts an Agent team can claim.

The test is dependence, not count. Criteria that must land together stay together; split only where
one part can be built, reviewed, and merged without waiting for another.

verdict "keep": the work is already one contract. Say why in "because".
verdict "split": return at least two contracts. Every criterion of the parent is assigned to exactly
one contract, every contract copies the parent's id into source_intent and the criterion's target
into target, contract ids are unique, and "after" names only other contracts in this same list.
Use "after" for real ordering; leave it empty when the contracts are independent.
Never invent a criterion, a repository, or an identifier the parent intent does not contain.`;

const systemPrompt = `You turn a human conversation into structured values for deterministic Rule gaps.
Each supplied gap carries its own question and its own valueSchema. Copy its ruleId and slot exactly.
Produce the exact JSON type and shape that gap's valueSchema requires.

answers: gaps the human actually answered or explicitly confirmed. Use only facts they stated.
proposals: your own draft for gaps they did not answer, each with a short reason naming what in the
conversation it rests on. A draft is a suggestion for a person to accept or correct, never an answer.
Prioritize facts in the latest human message, then focusGap. When the message corrects a pending proposal,
return that revised proposal before unrelated gaps. Return no more than two entries total across answers
and proposals. Do not fill unrelated gaps with generic defaults. Leave a gap out when you have
no evidence. If a valueSchema requires several fields and the human did not explicitly supply every one,
put the completed value in proposals, not answers. Missing information is not an explicit empty list.
When the latest message enumerates items for an array field, preserve every item separately. Do not
summarize concrete items into a generic category or keep an older, less specific pending list.
Never copy a pendingProposals slot into answers. The application confirms those drafts separately; if
the human changes one, return the revised value in proposals with a reason grounded in their correction.
Never move a draft into answers yourself. Never invent identifiers, file paths, or test names.

Return only answers and proposals. The application reports progress and asks the next question.
Never claim that a specification is complete or sealed.`;

export interface OllamaAdapterOptions {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  contextTokens?: number;
  fetch?: typeof fetch;
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new ModelPortError('unavailable', `the model ${name} must be a positive integer`);
  }
  return value;
}

/**
 * Refuses a reply the runtime could not have produced with the whole prompt in
 * view. Ollama reports how much it read; a generation that would not fit beside
 * that reading overran the window, and what overran it was the instructions.
 */
function assertReplyFitsWindow(envelope: Record<string, unknown>, contextTokens: number, outputTokens: number): void {
  const read = envelope['prompt_eval_count'];
  if (typeof read !== 'number' || !Number.isInteger(read) || read < 0) {
    throw new ModelPortError('context_exceeded', 'the model runtime did not report how much of the prompt it read');
  }
  if (read + outputTokens > contextTokens) {
    throw new ModelPortError('context_exceeded', 'the conversation no longer fits the model context window');
  }
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

function structuredContent(envelope: Record<string, unknown>): unknown {
  const message = envelope['message'];
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

/** Provider adapter only: it translates the neutral port to Ollama's local API. */
export class OllamaAdapter implements ModelPort, SplitPort {
  readonly #endpoint: URL;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #maxOutputTokens: number;
  readonly #contextTokens: number;
  readonly #fetch: typeof fetch;

  constructor(options: OllamaAdapterOptions) {
    if (!options.model.trim()) throw new ModelPortError('unavailable', 'a model name is required');
    this.#timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeout');
    this.#maxOutputTokens = positiveInteger(options.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS, 'output budget');
    this.#contextTokens = positiveInteger(options.contextTokens, DEFAULT_CONTEXT_TOKENS, 'context window');
    if (this.#contextTokens <= this.#maxOutputTokens) {
      throw new ModelPortError('unavailable', 'the model context window must exceed its output budget');
    }
    this.#endpoint = chatEndpoint(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#model = options.model;
    this.#fetch = options.fetch ?? fetch;
  }

  async complete(request: ModelRequest): Promise<unknown> {
    return this.#ask(proposalFormat, [
      { role: 'system', content: systemPrompt },
      ...request.messages,
      {
        role: 'system',
        content: JSON.stringify({
          currentDraft: request.draft,
          pendingProposals: request.proposals,
          focusGap: request.focus,
          gaps: request.missing,
        }),
      },
    ]);
  }

  async splitIntent(request: SplitRequest): Promise<unknown> {
    return this.#ask(splitFormat, [
      { role: 'system', content: splitPrompt },
      { role: 'user', content: JSON.stringify({ parentIntent: request.intent }) },
    ]);
  }

  async #ask(format: unknown, messages: readonly { role: string; content: string }[]): Promise<unknown> {
    const response = await this.#post(format, messages);
    if (!response.ok) {
      throw new ModelPortError('unavailable', `the model runtime returned HTTP ${response.status}`);
    }
    const envelope = await this.#envelope(response);
    assertReplyFitsWindow(envelope, this.#contextTokens, this.#maxOutputTokens);
    return structuredContent(envelope);
  }

  async #post(format: unknown, messages: readonly { role: string; content: string }[]): Promise<Response> {
    try {
      return await this.#fetch(this.#endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(this.#timeoutMs),
        body: JSON.stringify({
          model: this.#model,
          stream: false,
          think: false,
          keep_alive: DEFAULT_KEEP_ALIVE,
          format,
          options: { temperature: 0, num_predict: this.#maxOutputTokens, num_ctx: this.#contextTokens },
          messages,
        }),
      });
    } catch (error) {
      if (error instanceof ModelPortError) throw error;
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new ModelPortError('timed_out', 'the model runtime exceeded its deadline');
      }
      throw new ModelPortError('unavailable', 'the model runtime could not be reached');
    }
  }

  async #envelope(response: Response): Promise<Record<string, unknown>> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await responseText(response)) as unknown;
    } catch (error) {
      if (error instanceof ModelPortError) throw error;
      throw new ModelPortError('invalid_response', 'the model runtime returned invalid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new ModelPortError('invalid_response', 'the model runtime returned an invalid envelope');
    }
    return parsed as Record<string, unknown>;
  }
}
