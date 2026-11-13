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

// ─────────────────────────────
// 受け取りの反映と終わり方。受け取る候補はいつも**最後の `assistant` の選んでいる候補**。
// ─────────────────────────────

function updateStreaming(chat: Chat, update: (candidate: Candidate) => Candidate): Chat {
  if (!isStreaming(chat)) return chat;
  return replaceLast(chat, (message) => {
    const candidate = selectedCandidate(message);
    return candidate === undefined ? message : withCandidate(message, update(candidate));
  });
}

/** 受け取りの途中の値（届いた順に書き足す） */
interface ReceivedParts {
  content: string;
  reasoning: string;
  usage: Candidate['usage'];
  finishReason: Candidate['finishReason'];
  toolCalls: Candidate['toolCalls'];
  billing: Candidate['billing'];
  citations: Candidate['citations'];
}

/** 届いたものを受け取り中の候補へ足す。届いた順にまとめて渡せる。終わり方は覚えるだけ */
export function applyStreamEvents(chat: Chat, events: readonly ChatStreamEvent[]): Chat {
  if (events.length === 0) return chat;
  return updateStreaming(chat, (candidate) => {
    const { content, reasoning, usage, finishReason, toolCalls, billing, citations } = candidate;
    const received = { content, reasoning, usage, finishReason, toolCalls, billing, citations };
    // 本文を書かせている間の呼び出しは足さない（`index` が前の呼び出しに重なる）
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

/** 届いた 1 つを受け取りの途中の値へ足す */
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
      // 1 つの JSON の本文はプレフィルを含んで返ることがある。頭が同じなら重ねない
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

/**
 * 届いた本文を足した全体（会話の外の受け取り: 要約・構成の相談）。1 つの JSON で返ったら、それが全体
 */
export function textWithDelta(
  text: string,
  delta: Extract<ChatStreamEvent, { kind: 'delta' }>,
): string {
  return delta.whole === true ? delta.content : text + delta.content;
}

/** 1 トークンあたりの費用（米ドル）。分からなければ null */
interface TokenPrice {
  readonly prompt: number | null;
  readonly completion: number | null;
  /** キャッシュの読み・書き（`input_cache_read`・`input_cache_write`）。無ければ `prompt` で数える */
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
}

/**
 * なし × prompt ＋ 読み × キャッシュの読み ＋ 書き × キャッシュの書き ＋ 出力 × completion。
 * prompt か completion が分からなければ null
 */
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

/** 受け取りの時刻（ms）から記録を作る。測れなかった項目は持たない */
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

/** 受け取り中の候補に受け取りの記録を残す（受け取りを終える前に呼ぶ） */
export function recordTiming(chat: Chat, timing: (candidate: Candidate) => ResponseTiming): Chat {
  return updateStreaming(chat, (candidate) => ({ ...candidate, timing: timing(candidate) }));
}

/** 出典を後ろに足す。同じ URL は前のものを残す */
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

/**
 * 受け取り中の候補の本文をプレフィルで始める。ストリーミングの差分はプレフィルを含まないので、
 * 頭に付けておく。受け取り中でないか、既に本文があれば変えない
 */
export function startWithPrefill(chat: Chat, prefill: string): Chat {
  if (prefill.length === 0) return chat;
  return updateStreaming(chat, (candidate) =>
    candidate.content.length > 0 ? candidate : { ...candidate, content: prefill },
  );
}

/**
 * 受け取り中の候補に、送るときの見積もり（補正なし）と外した履歴の件数を残す。
 * 外さなかったら件数は持たない
 */
export function recordSend(chat: Chat, estimate: number, drop: number): Chat {
  return updateStreaming(chat, ({ trimmed, ...rest }) => {
    void trimmed;
    return { ...rest, sentEstimate: estimate, ...(drop > 0 ? { trimmed: drop } : {}) };
  });
}

/** 受け取り中の候補が、書き始め（プレフィル）のほかに何も受け取っていないか */
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

/** 呼び出しを確かめる手段が無いときは、どのワークフローも知らないものとして扱う */
const UNKNOWN_TOOL = (): ToolCallState => ({ kind: 'invalid', problem: { code: 'unknown-tool' } });

/**
 * 受け取りを終える。成功なら届いた終わり方（無ければ null）で閉じ、
 * 止めた・失敗したなら受け取った分を残して印を付ける。
 * 受け取った呼び出しは `check` で確かめる（止めた・失敗したら外す）
 */
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

/**
 * 読み戻した会話に受け取り中の候補が残っていたら、止めたものとして閉じる
 */
export function settleInterrupted(chat: Chat): Chat {
  return finishStream(chat, { kind: 'stopped' });
}
