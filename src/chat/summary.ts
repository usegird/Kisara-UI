import { summarizedCount } from '@/chat/assemble';
import { selectedCandidate } from '@/chat/edit';
import { applyMacros, type PromptSources } from '@/chat/macros';
import { estimateMessages } from '@/chat/tokens';
import type { Chat } from '@/chat/types';
import type { ChatRequestMessage } from '@/port/llm-port';

// ─────────────────────────────
// 会話履歴の要約で、前の要約と縮める発言のうち何を LLM に渡すかを決める。送るのは会話のストア。
// ─────────────────────────────

/** 要約せずに残す新しい発言の件数 */
export const SUMMARY_KEEP = 4;

/**
 * 要約の指示（送る文。画面には出さない）。用途（雑談・作業・相談・創作など）を決めない汎用の文。
 * 会話の続きを書かせないよう、書き起こしはタグで囲んで渡す
 */
const SUMMARY_INSTRUCTION = [
  'You summarize a conversation so that it can continue with less context.',
  'The conversation can be of any kind: casual chat, work, consultation, creative writing,',
  'or anything else.',
  'If a previous summary is given, merge it with the new messages into one updated summary,',
  'keeping earlier points that still matter in compressed form.',
  '',
  'Cover what applies:',
  '- The people or parties involved, their roles and relationships',
  '- Facts, decisions and agreements, and anything the user specified',
  '  (keep names, numbers and specific terms exactly as written)',
  '- What happened, briefly and in order',
  '- Open questions, unfinished tasks and promises',
  '- The current state: what was being discussed or done most recently',
  '',
  'Do not add anything that is not in the conversation.',
  'Do not continue, answer or comment on the conversation.',
  'Write in the same language as the conversation, in at most about 500 words.',
  'Output only the summary.',
].join('\n');

/** 縮める発言の範囲（会話の発言の位置。`from` から `to` の手前まで）。縮めるものが無ければ null */
export interface SummaryRange {
  readonly from: number;
  readonly to: number;
}

/**
 * 次に縮められる範囲。要約した後ろから、新しい `SUMMARY_KEEP` 件の手前まで。
 * 受け取り中の会話では呼ばない（最後の発言も履歴として数える）
 */
export function summaryRange(chat: Chat): SummaryRange | null {
  const from = summarizedMessages(chat);
  const to = chat.messages.length - SUMMARY_KEEP;
  return to > from ? { from, to } : null;
}

/** 受け取り中でない会話で、要約が縮めた発言の件数（最後の発言まで数える） */
function summarizedMessages(chat: Chat): number {
  // 受け取る `assistant` が無い会話なので、仮の末尾を足して数える
  return summarizedCount({ ...chat, messages: [...chat.messages, PLACEHOLDER] });
}

const PLACEHOLDER = { id: ':placeholder', role: 'assistant', candidates: [], selected: 0 } as const;

/** 縮める発言を「名前: 本文」で並べた文 */
function transcript(chat: Chat, sources: PromptSources, range: SummaryRange): string {
  const charName = sources.charName ?? 'Assistant';
  return chat.messages
    .slice(range.from, range.to)
    .flatMap((message) => {
      const content = selectedCandidate(message)?.content.trim() ?? '';
      if (content.length === 0) return [];
      // 名前にも戻すの行を掛ける（本文の中の名前と同じ文字で送る）
      const name = applyMacros(message.role === 'user' ? sources.userName : charName, sources);
      return [`${name}: ${applyMacros(content, sources)}`];
    })
    .join('\n\n');
}

/** 要約を作らせる `messages`。指示の `system` と、前の要約と縮める発言の `user` */
export function summaryMessages(
  chat: Chat,
  sources: PromptSources,
  range: SummaryRange,
): ChatRequestMessage[] {
  return summaryRequestMessages(chat.summary?.content ?? '', transcript(chat, sources, range));
}

/**
 * 前の要約と、縮める発言を「名前: 本文」で並べた文から、要約を作らせる `messages` を組む
 * （会話と構成の相談で同じ指示を使う）
 */
export function summaryRequestMessages(
  previousSummary: string,
  body: string,
): ChatRequestMessage[] {
  const previous = previousSummary.trim();
  const conversation = `<conversation>\n${body}\n</conversation>`;
  const content =
    previous.length === 0
      ? conversation
      : `<previous_summary>\n${previous}\n</previous_summary>\n\n${conversation}`;
  return [
    { role: 'system', content: SUMMARY_INSTRUCTION },
    { role: 'user', content },
  ];
}

/** 要約の要求を収める上限と、見積もりの補正の比 */
export interface SummaryFit {
  readonly limit: number | null;
  readonly ratio: number;
}

/**
 * 上限に収まる範囲。古い方から、見積もりが上限に収まるだけ縮める（少なくとも 1 件）。
 * 上限が分からなければ範囲のまま
 */
export function fitSummaryRange(
  chat: Chat,
  sources: PromptSources,
  range: SummaryRange,
  { limit, ratio }: SummaryFit,
): SummaryRange {
  if (limit === null) return range;
  const fits = (to: number): boolean =>
    estimateMessages(summaryMessages(chat, sources, { from: range.from, to })) * ratio <= limit;
  return fitRangeEnd(range, fits);
}

/**
 * 範囲の終わりを、`fits` が通る所まで縮める（少なくとも 1 件）。`fits` は終わりが前ほど通りやすい
 */
export function fitRangeEnd(range: SummaryRange, fits: (to: number) => boolean): SummaryRange {
  if (fits(range.to)) return range;
  let low = range.from + 1;
  let high = range.to;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  return { from: range.from, to: low };
}
