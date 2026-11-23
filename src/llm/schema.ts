import { finiteNumber, isRecord, isUnknownArray } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';
import { isWebUrl } from '@/lib/web-url';
import { modelDetailsOf } from '@/llm/model-details';
import type { ChatStreamEvent, ContextOverflow, ModelDetails } from '@/port/llm-port';

const MODEL_LIST_LIMIT = 10_000;

interface ParsedModelList {
  readonly ids: string[];
  readonly contexts: Record<string, number>;
  readonly details: Record<string, ModelDetails>;
  readonly llamaCpp: boolean;
  readonly truncated: boolean;
}

function positive(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function contextOf(item: Record<string, unknown>): number | null {
  return (
    positive(item.context_length) ??
    positive(item.max_model_len) ??
    (isRecord(item.meta) ? positive(item.meta.n_ctx_train) : null)
  );
}

export function parseModelList(raw: unknown): ParsedModelList {
  const result: ParsedModelList = {
    ids: [],
    contexts: {},
    details: {},
    llamaCpp: false,
    truncated: false,
  };
  if (!isRecord(raw) || !isUnknownArray(raw.data)) return result;
  let llamaCpp = false;
  for (const item of raw.data) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length === 0) continue;
    if (result.ids.length >= MODEL_LIST_LIMIT) return { ...result, llamaCpp, truncated: true };
    result.ids.push(item.id);
    const context = contextOf(item);
    if (context !== null) setOwn(result.contexts, item.id, context);
    const details = modelDetailsOf(item);
    if (details !== null) setOwn(result.details, item.id, details);
    if (item.owned_by === 'llamacpp') llamaCpp = true;
  }
  return { ...result, llamaCpp };
}

export function parsePropsContext(raw: unknown): number | null {
  if (!isRecord(raw) || !isRecord(raw.default_generation_settings)) return null;
  return positive(raw.default_generation_settings.n_ctx);
}

export function parseErrorMessage(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  if (isRecord(raw.error) && typeof raw.error.message === 'string') return raw.error.message;
  if (typeof raw.error === 'string') return raw.error;
  if (typeof raw.message === 'string') return raw.message;
  if (typeof raw.detail === 'string') return raw.detail;
  return undefined;
}

function numberIn(text: string, pattern: RegExp): number | null {
  const found = pattern.exec(text)?.[1];
  return found === undefined ? null : positive(Number(found.replace(/,/g, '')));
}

function overflowInText(text: string): ContextOverflow | undefined {
  const pair = /(\d[\d,]*) tokens? > (\d[\d,]*) maximum/i.exec(text);
  const maximum = positive(Number(pair?.[2]?.replace(/,/g, '')));
  if (maximum !== null) {
    return { context: maximum, prompt: positive(Number(pair?.[1]?.replace(/,/g, ''))) };
  }
  const context = numberIn(text, /maximum context length is (\d[\d,]*)/i);
  if (context === null) return undefined;
  const requested = numberIn(text, /requested (?:about )?(\d[\d,]*) tokens/i);
  const output = numberIn(text, /(\d[\d,]*) (?:tokens )?(?:in|of) the (?:completion|output)/i);
  const prompt =
    numberIn(text, /(\d[\d,]*) (?:tokens )?in the messages/i) ??
    numberIn(text, /messages resulted in (\d[\d,]*)/i) ??
    (requested === null ? null : requested - (output ?? 0));
  return { context, prompt: prompt !== null && prompt > 0 ? prompt : null };
}

export function parseContextOverflow(raw: unknown): ContextOverflow | undefined {
  if (!isRecord(raw)) return undefined;
  const error = isRecord(raw.error) ? raw.error : raw;
  const context = positive(error.n_ctx);
  if (context !== null) return { context, prompt: positive(error.n_prompt_tokens) };
  const message = parseErrorMessage(raw);
  return message === undefined ? undefined : overflowInText(message);
}

function reasoningOf(part: Record<string, unknown>): string {
  for (const key of ['reasoning_content', 'reasoning']) {
    const value = part[key];
    if (typeof value === 'string') return value;
  }
  return '';
}

function toolCallsOf(part: Record<string, unknown>): ChatStreamEvent[] {
  if (!isUnknownArray(part.tool_calls)) return [];
  return part.tool_calls.flatMap((item, position): ChatStreamEvent[] => {
    if (!isRecord(item)) return [];
    const index = finiteNumber(item.index) ?? position;
    const fn = isRecord(item.function) ? item.function : {};
    const args = fn.arguments;
    return [
      {
        kind: 'tool-call',
        index,
        id: typeof item.id === 'string' ? item.id : '',
        name: typeof fn.name === 'string' ? fn.name : '',
        arguments: argumentsTextOf(args),
      },
    ];
  });
}

function cacheOf(usage: Record<string, unknown>): { cacheRead?: number; cacheWrite?: number } {
  const details = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  const read = finiteNumber(details.cached_tokens) ?? finiteNumber(usage.prompt_cache_hit_tokens);
  const write = finiteNumber(details.cache_write_tokens);
  return {
    ...(read === null ? {} : { cacheRead: read }),
    ...(write === null ? {} : { cacheWrite: write }),
  };
}

function usageOf(raw: Record<string, unknown>): ChatStreamEvent | null {
  if (!isRecord(raw.usage)) return null;
  const prompt = finiteNumber(raw.usage.prompt_tokens);
  const completion = finiteNumber(raw.usage.completion_tokens);
  if (prompt === null || completion === null) return null;
  return { kind: 'usage', usage: { prompt, completion, ...cacheOf(raw.usage) } };
}

function billingOf(raw: Record<string, unknown>): ChatStreamEvent | null {
  if (!isRecord(raw.usage)) return null;
  const usage = raw.usage;
  const countOf = (name: string): number | null => {
    for (const tools of [usage.server_tool_use_details, usage.server_tool_use]) {
      const count = isRecord(tools) ? finiteNumber(tools[name]) : null;
      if (count !== null) return count;
    }
    return null;
  };
  const searches = countOf('web_search_requests');
  const fetches = countOf('web_fetch_requests');
  const toolCalls = countOf('tool_calls_executed');
  const cost = finiteNumber(usage.cost);
  const inferenceCost = isRecord(usage.cost_details)
    ? finiteNumber(usage.cost_details.upstream_inference_cost)
    : null;
  if (searches === null && fetches === null && toolCalls === null && cost === null) return null;
  return {
    kind: 'billing',
    billing: {
      ...(searches === null ? {} : { searches }),
      ...(fetches === null ? {} : { fetches }),
      ...(toolCalls === null ? {} : { toolCalls }),
      ...(cost === null ? {} : { cost }),
      ...(inferenceCost === null ? {} : { inferenceCost }),
    },
  };
}

function citationsOf(part: Record<string, unknown>): ChatStreamEvent[] {
  if (!isUnknownArray(part.annotations)) return [];
  const citations = part.annotations.flatMap((item) => {
    if (!isRecord(item) || item.type !== 'url_citation' || !isRecord(item.url_citation)) return [];
    const { url, title } = item.url_citation;
    if (typeof url !== 'string' || !isWebUrl(url)) return [];
    return [{ url, title: typeof title === 'string' ? title : '' }];
  });
  return citations.length === 0 ? [] : [{ kind: 'citations', citations }];
}

export function isProcessingComment(text: string): boolean {
  return text === 'OPENROUTER PROCESSING';
}

export function parseCompletionChunk(raw: unknown): ChatStreamEvent[] {
  if (!isRecord(raw)) return [];
  const events: ChatStreamEvent[] = [];
  const choice = isUnknownArray(raw.choices) ? raw.choices[0] : undefined;
  if (isRecord(choice)) {
    const part = isRecord(choice.delta)
      ? choice.delta
      : isRecord(choice.message)
        ? choice.message
        : null;
    if (part !== null) {
      const content = typeof part.content === 'string' ? part.content : '';
      const reasoning = reasoningOf(part);
      if (content.length > 0 || reasoning.length > 0) {
        events.push({ kind: 'delta', content, reasoning });
      }
      events.push(...toolCallsOf(part));
      events.push(...citationsOf(part));
    }
    if (typeof choice.finish_reason === 'string') {
      events.push({ kind: 'finish', reason: choice.finish_reason });
    }
  }
  const usage = usageOf(raw);
  if (usage !== null) events.push(usage);
  const billing = billingOf(raw);
  if (billing !== null) events.push(billing);
  return events;
}

function argumentsTextOf(args: unknown): string {
  if (typeof args === 'string') return args;
  return args === undefined ? '' : JSON.stringify(args);
}
