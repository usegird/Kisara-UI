import { summaryText } from '@/chat/assemble';
import type { AdvisorMessage } from '@/chat/prompt-advisor';
import { fitRangeEnd, summaryRequestMessages, type SummaryRange } from '@/chat/summary';
import { estimateMessages, NEAR_LIMIT_SHARE } from '@/chat/tokens';
import type { ChatRequestMessage, LlmFailure } from '@/port/llm-port';

const SPEAKER = { user: 'User', assistant: 'Assistant' } as const;

const ADVISOR_SUMMARY_KEEP = 2;

const LENGTH_FINISH = 'length';

export type AdvisorLimitNotice = 'near' | 'over';

export interface AdvisorSummary {
  readonly content: string;
  readonly upTo: string;
}

export function advisorSummarizedCount(
  messages: readonly AdvisorMessage[],
  summary: AdvisorSummary | undefined,
): number {
  if (summary === undefined) return 0;
  return messages.findIndex((message) => message.id === summary.upTo) + 1;
}

export function advisorSummaryRange(
  messages: readonly AdvisorMessage[],
  summary: AdvisorSummary | undefined,
): SummaryRange | null {
  const from = advisorSummarizedCount(messages, summary);
  const to = messages.length - ADVISOR_SUMMARY_KEEP;
  return to > from ? { from, to } : null;
}

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

export function advisorUnsummarized(
  messages: readonly AdvisorMessage[],
  summary: AdvisorSummary | undefined,
): readonly AdvisorMessage[] {
  return messages.slice(advisorSummarizedCount(messages, summary));
}

export function advisorSummaryText(summary: AdvisorSummary | undefined): string {
  return summary === undefined ? '' : summaryText(summary.content);
}

export function advisorLimitNoticeOf(
  messages: readonly AdvisorMessage[],
  failure: LlmFailure | null,
  limit: number | null,
): AdvisorLimitNotice | null {
  if (failure?.overflow !== undefined) return 'over';
  if (messages.at(-1)?.finishReason === LENGTH_FINISH) return 'over';
  return isAdvisorNearLimit(messages, limit) ? 'near' : null;
}

export function isAdvisorNearLimit(
  messages: readonly AdvisorMessage[],
  limit: number | null,
): boolean {
  const usage = messages.at(-1)?.usage;
  if (usage === undefined || limit === null || limit === 0) return false;
  return usage.prompt + usage.completion >= limit * NEAR_LIMIT_SHARE;
}

function transcript(messages: readonly AdvisorMessage[], from: number, to: number): string {
  return messages
    .slice(from, to)
    .flatMap((message) => {
      const proposals = (message.toolCalls ?? []).map((call) => `[proposal] ${call.arguments}`);
      const content = [message.content.trim(), ...proposals].filter((part) => part.length > 0);
      return content.length === 0 ? [] : [`${SPEAKER[message.role]}: ${content.join('\n')}`];
    })
    .join('\n\n');
}
