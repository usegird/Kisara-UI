import { summaryText } from '@/chat/assemble';
import type { AdvisorMessage } from '@/chat/prompt-advisor';
import { fitRangeEnd, summaryRequestMessages, type SummaryRange } from '@/chat/summary';
import { estimateMessages, NEAR_LIMIT_SHARE } from '@/chat/tokens';
import type { ChatRequestMessage, LlmFailure } from '@/port/llm-port';

// ─────────────────────────────
// 構成の相談の要約。縮める範囲・要約させる中身・要約した後に送る発言・上限に近いかを決める。
// 送るのはストア
// ─────────────────────────────

/** 書き起こしで発言に付ける名前（相談は会話の名前を持たない） */
const SPEAKER = { user: 'User', assistant: 'Assistant' } as const;

/** 要約せずに残す新しい発言の件数（最後のやり取り 1 往復） */
const ADVISOR_SUMMARY_KEEP = 2;

/** 返答が長さの上限で切れたときの `finish_reason` */
const LENGTH_FINISH = 'length';

/** 要約を促す知らせ。上限に近い・上限を超えた（切れた・送れなかった） */
export type AdvisorLimitNotice = 'near' | 'over';

/** 相談の要約。`upTo` はどの発言まで縮めたか（発言の id） */
export interface AdvisorSummary {
  readonly content: string;
  readonly upTo: string;
}

/** 要約が縮めた発言の件数。要約が無い・指す発言が無ければ 0 */
export function advisorSummarizedCount(
  messages: readonly AdvisorMessage[],
  summary: AdvisorSummary | undefined,
): number {
  if (summary === undefined) return 0;
  return messages.findIndex((message) => message.id === summary.upTo) + 1;
}

/**
 * 次に縮められる範囲。要約した後ろから、新しい `ADVISOR_SUMMARY_KEEP` 件の手前まで。無ければ null。
 * 相談は 1 通が長く、少ないやり取りで上限に届くので、会話より少なく残す
 */
export function advisorSummaryRange(
  messages: readonly AdvisorMessage[],
  summary: AdvisorSummary | undefined,
): SummaryRange | null {
  const from = advisorSummarizedCount(messages, summary);
  const to = messages.length - ADVISOR_SUMMARY_KEEP;
  return to > from ? { from, to } : null;
}

/**
 * 要約を作らせる `messages`。上限が分かれば、古い方から収まるだけ縮める（少なくとも 1 件）。
 * 縮める範囲も返す
 */
export function advisorSummaryRequest(
  messages: readonly AdvisorMessage[],
  summary: AdvisorSummary | undefined,
  { range, limit }: { readonly range: SummaryRange; readonly limit: number | null },
): { readonly messages: ChatRequestMessage[]; readonly range: SummaryRange } {
  const build = (to: number): ChatRequestMessage[] =>
    summaryRequestMessages(summary?.content ?? '', transcript(messages, range.from, to));
  const fitted =
    limit === null ? range : fitRangeEnd(range, (to) => estimateMessages(build(to)) <= limit);
  return { messages: build(fitted.to), range: fitted };
}

/** 要約した相談で送る発言。縮めた発言を外す */
export function advisorUnsummarized(
  messages: readonly AdvisorMessage[],
  summary: AdvisorSummary | undefined,
): readonly AdvisorMessage[] {
  return messages.slice(advisorSummarizedCount(messages, summary));
}

/** 初期メッセージの後ろに置く要約の文（会話と同じ形）。要約が無ければ空 */
export function advisorSummaryText(summary: AdvisorSummary | undefined): string {
  return summary === undefined ? '' : summaryText(summary.content);
}

/**
 * 要約を促す知らせ。上限を超えて送れなかった・最後の発言が長さで切れたなら上限を超えた、最後の発言で
 * 使った数が上限の 8 割以上なら上限に近い。どれでもなければ null（縮める発言があるかは見ない）
 */
export function advisorLimitNoticeOf(
  messages: readonly AdvisorMessage[],
  failure: LlmFailure | null,
  limit: number | null,
): AdvisorLimitNotice | null {
  if (failure?.overflow !== undefined) return 'over';
  if (messages.at(-1)?.finishReason === LENGTH_FINISH) return 'over';
  return isAdvisorNearLimit(messages, limit) ? 'near' : null;
}

/**
 * 最後の LLM の発言で使ったトークン数（送った分と返答の分の和）が、送れる上限の 8 割以上か。
 * 上限が分からない・数が返っていなければ偽
 */
export function isAdvisorNearLimit(
  messages: readonly AdvisorMessage[],
  limit: number | null,
): boolean {
  const usage = messages.at(-1)?.usage;
  if (usage === undefined || limit === null || limit === 0) return false;
  return usage.prompt + usage.completion >= limit * NEAR_LIMIT_SHARE;
}

/** 縮める発言を「名前: 本文」で並べた文 */
function transcript(messages: readonly AdvisorMessage[], from: number, to: number): string {
  return messages
    .slice(from, to)
    .flatMap((message) => {
      // 案の呼び出しは引数の JSON を本文の後ろに添える（何を出したかを要約に残す）
      const proposals = (message.toolCalls ?? []).map((call) => `[proposal] ${call.arguments}`);
      const content = [message.content.trim(), ...proposals].filter((part) => part.length > 0);
      return content.length === 0 ? [] : [`${SPEAKER[message.role]}: ${content.join('\n')}`];
    })
    .join('\n\n');
}
