import { isStreaming, replaceLast, selectedCandidate, withCandidate } from '@/chat/edit';
import { addToolCallPart, settleReceivedCalls, writesReply } from '@/chat/tool-calls';
import type {
  Candidate,
  CandidateEnd,
  Chat,
  ResponseTiming,
  ToolCallRecord,
  ToolCallState,
} from '@/chat/types';
import type { ChatStreamEvent, Citation, LlmFailure, TokenUsage } from '@/port/llm-port';

function updateStreaming(chat: Chat, update: (candidate: Candidate) => Candidate): Chat {
  if (!isStreaming(chat)) return chat;
  return replaceLast(chat, (message) => {
    const candidate = selectedCandidate(message);
    return candidate === undefined ? message : withCandidate(message, update(candidate));
  });
}

interface ReceivedParts {
  content: string;
  reasoning: string;
  usage: Candidate['usage'];
  finishReason: Candidate['finishReason'];
  toolCalls: Candidate['toolCalls'];
  billing: Candidate['billing'];
  citations: Candidate['citations'];
}

export function applyStreamEvents(chat: Chat, events: readonly ChatStreamEvent[]): Chat {
  if (events.length === 0) return chat;
  return updateStreaming(chat, (candidate) => {
    const { content, reasoning, usage, finishReason, toolCalls, billing, citations } = candidate;
    const received = { content, reasoning, usage, finishReason, toolCalls, billing, citations };
    const replying = writesReply(candidate);
    for (const event of events) addStreamEvent(received, event, replying);
    return {
      ...candidate,
      content: received.content,
      reasoning: received.reasoning,
      usage: received.usage,
      finishReason: received.finishReason,
      ...(received.toolCalls === undefined ? {} : { toolCalls: received.toolCalls }),
      ...(received.billing === undefined ? {} : { billing: received.billing }),
      ...(received.citations === undefined || received.citations.length === 0
        ? {}
        : { citations: received.citations }),
    };
  });
}

function addStreamEvent(received: ReceivedParts, event: ChatStreamEvent, replying: boolean): void {
  switch (event.kind) {
    case 'billing':
      received.billing = { ...received.billing, ...event.billing };
      break;
    case 'citations':
      received.citations = mergeCitations(received.citations ?? [], event.citations);
      break;
    case 'tool-call':
      if (!replying) received.toolCalls = addToolCallPart(received.toolCalls ?? [], event);
      break;
    case 'delta':
      received.content =
        event.whole === true &&
        received.content.length > 0 &&
        event.content.startsWith(received.content)
          ? event.content
          : received.content + event.content;
      received.reasoning += event.reasoning;
      break;
    case 'usage':
      received.usage = event.usage;
      break;
    case 'finish':
      received.finishReason = event.reason;
      break;
    default:
      break;
  }
}

export function textWithDelta(
  text: string,
  delta: Extract<ChatStreamEvent, { kind: 'delta' }>,
): string {
  return delta.whole === true ? delta.content : text + delta.content;
}

interface TokenPrice {
  readonly prompt: number | null;
  readonly completion: number | null;
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
}

function referenceCost(usage: TokenUsage | undefined, price: TokenPrice): number | null {
  if (usage === undefined || price.prompt === null || price.completion === null) return null;
  const read = usage.cacheRead ?? 0;
  const write = usage.cacheWrite ?? 0;
  return (
    (usage.prompt - read - write) * price.prompt +
    read * (price.cacheRead ?? price.prompt) +
    write * (price.cacheWrite ?? price.prompt) +
    usage.completion * price.completion
  );
}

export function timingOf(
  times: {
    readonly sentAt: number;
    readonly firstAt: number | null;
    readonly endedAt: number | null;
  },
  usage: TokenUsage | undefined,
  price: TokenPrice,
): ResponseTiming {
  const { sentAt, firstAt, endedAt } = times;
  const usd = referenceCost(usage, price);
  return {
    ...(firstAt === null ? {} : { firstMs: firstAt - sentAt }),
    ...(firstAt === null || endedAt === null ? {} : { receivingMs: endedAt - firstAt }),
    ...(usd === null ? {} : { referenceUsd: usd }),
  };
}

export function recordTiming(chat: Chat, timing: (candidate: Candidate) => ResponseTiming): Chat {
  return updateStreaming(chat, (candidate) => ({ ...candidate, timing: timing(candidate) }));
}

export function mergeCitations(
  current: readonly Citation[],
  added: readonly Citation[],
): readonly Citation[] {
  const seen = new Set(current.map((item) => item.url));
  const next = [...current];
  for (const item of added) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    next.push(item);
  }
  return next.length === current.length ? current : next;
}

export function startWithPrefill(chat: Chat, prefill: string): Chat {
  if (prefill.length === 0) return chat;
  return updateStreaming(chat, (candidate) =>
    candidate.content.length > 0 ? candidate : { ...candidate, content: prefill },
  );
}

export function recordSend(chat: Chat, estimate: number, drop: number): Chat {
  return updateStreaming(chat, ({ trimmed, ...rest }) => {
    void trimmed;
    return { ...rest, sentEstimate: estimate, ...(drop > 0 ? { trimmed: drop } : {}) };
  });
}

export function receivedNothing(chat: Chat, prefill: string): boolean {
  const message = chat.messages.at(-1);
  const candidate = message === undefined ? undefined : selectedCandidate(message);
  return (
    candidate !== undefined &&
    candidate.content === prefill &&
    candidate.reasoning.length === 0 &&
    (candidate.toolCalls ?? []).length === 0
  );
}

const UNKNOWN_TOOL = (): ToolCallState => ({ kind: 'invalid', problem: { code: 'unknown-tool' } });

export function finishStream(
  chat: Chat,
  failure: LlmFailure | null,
  check: (call: ToolCallRecord) => ToolCallState = UNKNOWN_TOOL,
): Chat {
  return updateStreaming(chat, (received) => {
    const { finishReason, ...rest } = settleReceivedCalls(received, failure === null, check);
    const end: CandidateEnd =
      failure === null
        ? { kind: 'done', reason: finishReason ?? null }
        : failure.kind === 'stopped'
          ? { kind: 'stopped' }
          : { kind: 'failed', failure };
    return { ...rest, end };
  });
}

export function settleInterrupted(chat: Chat): Chat {
  return finishStream(chat, { kind: 'stopped' });
}
