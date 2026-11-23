import { summarizedCount } from '@/chat/assemble';
import { selectedCandidate } from '@/chat/edit';
import { applyMacros, type PromptSources } from '@/chat/macros';
import { estimateMessages } from '@/chat/tokens';
import type { Chat } from '@/chat/types';
import type { ChatRequestMessage } from '@/port/llm-port';

export const SUMMARY_KEEP = 4;

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

export interface SummaryRange {
  readonly from: number;
  readonly to: number;
}

export function summaryRange(chat: Chat): SummaryRange | null {
  const from = summarizedMessages(chat);
  const to = chat.messages.length - SUMMARY_KEEP;
  return to > from ? { from, to } : null;
}

function summarizedMessages(chat: Chat): number {
  return summarizedCount({ ...chat, messages: [...chat.messages, PLACEHOLDER] });
}

const PLACEHOLDER = { id: ':placeholder', role: 'assistant', candidates: [], selected: 0 } as const;

function transcript(chat: Chat, sources: PromptSources, range: SummaryRange): string {
  const charName = sources.charName ?? 'Assistant';
  return chat.messages
    .slice(range.from, range.to)
    .flatMap((message) => {
      const content = selectedCandidate(message)?.content.trim() ?? '';
      if (content.length === 0) return [];
      const name = applyMacros(message.role === 'user' ? sources.userName : charName, sources);
      return [`${name}: ${applyMacros(content, sources)}`];
    })
    .join('\n\n');
}

export function summaryMessages(
  chat: Chat,
  sources: PromptSources,
  range: SummaryRange,
): ChatRequestMessage[] {
  return summaryRequestMessages(chat.summary?.content ?? '', transcript(chat, sources, range));
}

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

export interface SummaryFit {
  readonly limit: number | null;
  readonly ratio: number;
}

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
