import { assembleParts, droppableCount, mergeParts, summarizedCount } from '@/chat/assemble';
import { isStreaming, selectedCandidate } from '@/chat/edit';
import { NO_SOURCES, type PromptSources } from '@/chat/macros';
import type { Candidate, Chat, PromptComposition } from '@/chat/types';
import type { ChatContentPart, ChatRequestMessage } from '@/port/llm-port';

// ─────────────────────────────
// トークン数の見積もり。数える道具もサーバーの経路も使わず、直前の応答の実際の数で補正し、
// 上限が分かれば収まるまで古い履歴を外す件数も決める。
// ─────────────────────────────

/** ASCII の終わりの次の符号位置 */
const ASCII_END = 0x80;
/** ASCII の 1 文字のトークンの見積もり（英語はおおよそ 4 文字で 1 トークン） */
const ASCII_CHAR_TOKENS = 0.25;

/**
 * 画像 1 枚の見積もり（Gemma 3 の公式値。モデルで変わるので目安）
 */
export const IMAGE_TOKENS = 256;

/** 1 つのメッセージに足す分（role などの区切り） */
const MESSAGE_OVERHEAD = 4;
const MIN_RATIO = 0.5;
const MAX_RATIO = 3;

/**
 * max_tokens を決めていないときに返答の分として取っておく、文脈長に対する割合と上限
 */
const REPLY_RESERVE_SHARE = 4;
const MAX_REPLY_RESERVE = 4096;
/** 要約を促し始める、送れる上限に対する割合 */
export const NEAR_LIMIT_SHARE = 0.8;

/**
 * 送る中身に使える上限。文脈長は送る中身と生成する分を合わせた長さなので、返答の分を引く。
 * 返答の分は max_tokens、決めていなければ文脈長の一部（入力で埋めると返答が途中で切れるため）。
 * 文脈長が分からなければ null
 */
export function inputLimitOf(context: number | null, maxTokens: number | undefined): number | null {
  if (context === null) return null;
  return Math.max(0, context - replyReserveOf(context, maxTokens));
}

/** 返答の分として取っておくトークン数 */
export function replyReserveOf(context: number, maxTokens: number | undefined): number {
  if (maxTokens !== undefined) return maxTokens;
  return Math.min(MAX_REPLY_RESERVE, Math.floor(context / REPLY_RESERVE_SHARE));
}

/**
 * 候補が送れる上限に近いか。使った数（送った分と返答の分。返答は次に送る履歴になる）が
 * 上限の 8 割以上。数が返らなければ送るときの見積もりで見る。上限が分からなければ近くない
 */
export function isNearInputLimit(candidate: Candidate | undefined, limit: number | null): boolean {
  if (candidate === undefined || limit === null || limit === 0) return false;
  const { usage, sentEstimate } = candidate;
  const used = usage === undefined ? sentEstimate : usage.prompt + usage.completion;
  return used !== undefined && used >= limit * NEAR_LIMIT_SHARE;
}

/**
 * 文字列のトークン数を見積もる
 */
export function estimateText(text: string): number {
  let total = 0;
  for (const char of text) {
    if (/\s/.test(char)) continue;
    total += (char.codePointAt(0) ?? 0) < ASCII_END ? ASCII_CHAR_TOKENS : 1;
  }
  return total;
}

/** 呼び出しの名前と引数の本文の見積もり（呼び出しを持たない発言は 0） */
function estimateCalls(message: ChatRequestMessage): number {
  if (!('tool_calls' in message)) return 0;
  return message.tool_calls.reduce(
    (sum, call) => sum + estimateText(call.function.name) + estimateText(call.function.arguments),
    0,
  );
}

/** `content` の見積もり（文字列か、本文と画像の部品の配列） */
function estimateContent(content: string | readonly ChatContentPart[] | null): number {
  if (content === null) return 0;
  if (typeof content === 'string') return estimateText(content);
  return content.reduce(
    (sum, part) => sum + (part.type === 'text' ? estimateText(part.text) : IMAGE_TOKENS),
    0,
  );
}

/** 送る中身の見積もり（補正なし） */
export function estimateMessages(messages: readonly ChatRequestMessage[]): number {
  return messages.reduce(
    (sum, message) =>
      sum + estimateContent(message.content) + estimateCalls(message) + MESSAGE_OVERHEAD,
    0,
  );
}

/** ワークフローの定義（`tools`）の見積もり（補正なし）。無ければ 0 */
export function estimateTools(definitions: readonly unknown[]): number {
  return definitions.length === 0
    ? 0
    : estimateText(JSON.stringify(definitions)) + MESSAGE_OVERHEAD;
}

/** 送る中身に使える上限と、`messages` の外で送る分（ワークフローの定義。補正なし） */
export interface SendBudget {
  /** 文脈長 − max_tokens。分からなければ null（外さない） */
  readonly limit: number | null;
  readonly tools: number;
}

/** 上限の分からない予算（何も外さない） */
const NO_BUDGET: SendBudget = { limit: null, tools: 0 };

/** 次に送る中身の見積もりと、上限に収めるための外す件数 */
interface TokenEstimate {
  /** 項目の id ごとの見積もり（補正済み）。プレフィルは PREFILL_ID */
  readonly items: ReadonlyMap<string, number>;
  /** 会話の履歴（メッセージを含む）の見積もり */
  readonly history: number;
  readonly total: number;
  /** 最後に受け取った候補の実際の数。無ければ null */
  readonly lastActual: number | null;
  /** 補正の比（打ちかけの本文などを同じ比で見積もるため） */
  readonly ratio: number;
  /** 上限に収めるため外す履歴の件数 */
  readonly drop: number;
  /** そのまま送る履歴の件数と、要約で縮めた件数 */
  readonly kept: number;
  readonly summarized: number;
}

/** 候補の実際の数。使ったトークン数か、文脈の上限の断りの送った数。無ければ null */
function actualOf(candidate: Candidate | undefined): number | null {
  if (candidate === undefined) return null;
  if (candidate.usage !== undefined) return candidate.usage.prompt;
  return candidate.end.kind === 'failed' ? (candidate.end.failure.overflow?.prompt ?? null) : null;
}

/**
 * 会話から補正の比と、比の元にした実際の数を求める
 */
export function calibration(
  chat: Chat,
  composition: PromptComposition,
  sources: PromptSources,
): { ratio: number; actual: number | null } {
  for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
    const message = chat.messages[index];
    const candidate = message === undefined ? undefined : selectedCandidate(message);
    const actual = actualOf(candidate);
    if (message?.role !== 'assistant' || actual === null) continue;
    const upTo = { ...chat, messages: chat.messages.slice(0, index + 1) };
    const estimated =
      candidate?.sentEstimate ??
      estimateMessages(mergeParts(assembleParts(upTo, composition, sources), squashOf(sources)));
    return { ratio: ratioOf(actual, estimated), actual };
  }
  return { ratio: 1, actual: null };
}

/**
 * 隣り合う system をまとめるか（全体の設定）
 */
function squashOf(sources: PromptSources): boolean {
  return sources.squashSystem === true;
}

/**
 * 実際の数と見積もりから補正の比を求める（断りの数から取り直すときにも使う）。見積もりが 0 なら 1
 */
export function ratioOf(actual: number, estimated: number): number {
  return estimated <= 0 ? 1 : Math.min(MAX_RATIO, Math.max(MIN_RATIO, actual / estimated));
}

/** 外す件数を決めたときの送るメッセージの見積もり（補正なし。ワークフローの定義は呼ぶ側が足す） */
function rawEstimate(
  chat: Chat,
  composition: PromptComposition,
  sources: PromptSources,
  drop: number,
): number {
  return estimateMessages(
    mergeParts(assembleParts(chat, composition, sources, drop), squashOf(sources)),
  );
}

/** 送る中身を組み立てる材料。`chat` は受け取る `assistant` を末尾に持つ形 */
export interface SendInput {
  readonly chat: Chat;
  readonly composition: PromptComposition;
  readonly sources: PromptSources;
}

/**
 * 上限に収まる最小の外す件数を求める
 */
export function fitDrop(
  { chat, composition, sources }: SendInput,
  budget: SendBudget,
  ratio: number,
): number {
  const limit = budget.limit;
  if (limit === null) return 0;
  const fits = (drop: number): boolean =>
    (rawEstimate(chat, composition, sources, drop) + budget.tools) * ratio <= limit;
  if (fits(0)) return 0;
  // 外すほど短くなるので、収まる最小の件数を二分探索で探す
  let low = 1;
  let high = droppableCount(chat);
  if (high === 0) return 0;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** 送る直前の決め方。外す件数と、送る中身の見積もり（補正なし。候補に残す） */
interface SendPlan {
  readonly drop: number;
  readonly estimate: number;
}

/** 受け取り中の会話を送るときの外す件数と見積もり。`ratio` を渡さなければ会話から補正を取る */
export function planSend(
  send: SendInput,
  budget: SendBudget,
  ratio: number = calibration(send.chat, send.composition, send.sources).ratio,
): SendPlan {
  const drop = fitDrop(send, budget, ratio);
  const estimate = rawEstimate(send.chat, send.composition, send.sources, drop);
  return { drop, estimate: estimate + budget.tools };
}

/**
 * 次に送る中身の見積もり。受け取り中なら今の送る中身を、そうでなければ会話の全部を
 * 履歴として数える（打つ発言は数えない）。上限が分かれば、収まるまで古い履歴を外した形で数える
 */
export function estimateChat(
  chat: Chat,
  composition: PromptComposition,
  sources: PromptSources = NO_SOURCES,
  budget: SendBudget = NO_BUDGET,
): TokenEstimate {
  const { ratio, actual } = calibration(chat, composition, sources);
  const shaped = withPending(chat);
  const drop = fitDrop({ chat: shaped, composition, sources }, budget, ratio);
  const parts = assembleParts(shaped, composition, sources, drop);
  const items = new Map<string, number>();
  let history = 0;
  for (const part of parts) {
    const value =
      estimateText(part.content) + (part.images?.length ?? 0) * IMAGE_TOKENS + MESSAGE_OVERHEAD;
    if (part.itemId === null) history += value;
    else items.set(part.itemId, (items.get(part.itemId) ?? 0) + value);
  }
  const scale = (value: number): number => Math.round(value * ratio);
  return {
    items: new Map([...items].map(([id, value]) => [id, scale(value)])),
    history: scale(history),
    total: scale(estimateMessages(mergeParts(parts, squashOf(sources)))),
    lastActual: actual,
    ratio,
    drop,
    kept: Math.max(0, shaped.messages.length - 1 - summarizedCount(shaped) - drop),
    summarized: summarizedCount(shaped),
  };
}

/** 受け取り中ならそのまま、そうでなければ受け取る側の仮の `assistant` を足した会話 */
function withPending(chat: Chat): Chat {
  return isStreaming(chat) ? chat : { ...chat, messages: [...chat.messages, PENDING] };
}

/** 次の発言を待つ会話の、受け取る側の仮の `assistant`（手前までを送る形にそろえる） */
const PENDING = {
  id: ':pending',
  role: 'assistant',
  candidates: [{ content: '', reasoning: '', end: { kind: 'streaming' } }],
  selected: 0,
} as const;

/** 1 つのメッセージとして送る文の見積もり（補正を掛ける。空なら 0） */
export function estimateMessage(text: string, ratio: number): number {
  return text.length === 0 ? 0 : Math.round((estimateText(text) + MESSAGE_OVERHEAD) * ratio);
}
