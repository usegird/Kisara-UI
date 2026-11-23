import { timingOf } from '@/chat/stream-receive';
import type { ResponseRecord, ResponseTiming } from '@/chat/types';
import { MS_PER_SECOND } from '@/components/ui/units';
import { t } from '@/i18n';
import { formatNumber } from '@/i18n/format';
import type { TokenUsage, ToolBilling } from '@/port/llm-port';
import {
  responseKey,
  useResponseStatsStore,
  type ResponseStats,
} from '@/store/use-response-stats-store';

export interface ResponseFigure {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

function costFigure(key: string, usd: number): ResponseFigure {
  return {
    key,
    label: t('llm.stats.cost'),
    value: t('llm.stats.costValue', {
      usd: formatNumber(Math.max(0, usd), { maximumFractionDigits: 6 }),
    }),
  };
}

function inferenceCostOf(
  billing: ToolBilling | undefined,
  timing: ResponseTiming | undefined,
  usedTools: boolean,
): number | undefined {
  if (billing?.inferenceCost !== undefined) return billing.inferenceCost;
  if (!usedTools && billing?.cost !== undefined) return billing.cost;
  return timing?.referenceUsd;
}

function buildToolFigures(
  billing: ToolBilling | undefined,
  inference: number | undefined,
  showCost: boolean,
): ResponseFigure[] {
  const counts = [
    { key: 'searches', label: t('llm.stats.searches'), count: billing?.searches },
    { key: 'fetches', label: t('llm.stats.fetches'), count: billing?.fetches },
    { key: 'toolCalls', label: t('llm.stats.toolCalls'), count: billing?.toolCalls },
  ].flatMap(({ key, label, count }) =>
    count === undefined ? [] : [{ key, label, value: t('llm.stats.countValue', { count }) }],
  );
  if (counts.length === 0) return [];
  const total = billing?.cost;
  return !showCost || total === undefined || inference === undefined
    ? counts
    : [...counts, costFigure('toolCost', total - inference)];
}

function buildCacheFigures(usage: TokenUsage): ResponseFigure[] {
  const figures: ResponseFigure[] = [];
  const { cacheRead: read, cacheWrite: write } = usage;
  if (read !== undefined && read > 0) {
    figures.push({
      key: 'cacheRead',
      label: t('llm.stats.cacheRead'),
      value: t('llm.stats.cacheValue', { value: formatNumber(read) }),
    });
  }
  if (write !== undefined && write > 0) {
    figures.push({
      key: 'cacheWrite',
      label: t('llm.stats.cacheWrite'),
      value: t('llm.stats.cacheValue', { value: formatNumber(write) }),
    });
  }
  return figures;
}

function buildTokenFigures(
  usage: TokenUsage | undefined,
  timing: ResponseTiming | undefined,
  inference: number | undefined,
  showCost: boolean,
): ResponseFigure[] {
  const line: ResponseFigure[] = [];
  if (usage !== undefined) {
    line.push({
      key: 'tokens',
      label: t('llm.stats.tokens'),
      value: t('llm.stats.tokensValue', {
        prompt: formatNumber(usage.prompt),
        completion: formatNumber(usage.completion),
      }),
    });
    line.push(...buildCacheFigures(usage));
  }
  const receiving = timing?.receivingMs;
  if (receiving !== undefined && usage !== undefined && receiving > 0) {
    const speed = usage.completion / (receiving / MS_PER_SECOND);
    line.push({
      key: 'speed',
      label: t('llm.stats.speed'),
      value: t('llm.stats.speedValue', {
        value: formatNumber(speed, { maximumFractionDigits: 1 }),
      }),
    });
  }
  if (showCost && inference !== undefined) line.push(costFigure('cost', inference));
  return line;
}

export function buildResponseFigures(
  usage: TokenUsage | undefined,
  timing: ResponseTiming | undefined,
  billing?: ToolBilling,
  showCost: boolean = import.meta.env.DEV,
): ResponseFigure[][] {
  const usedTools =
    billing?.searches !== undefined ||
    billing?.fetches !== undefined ||
    billing?.toolCalls !== undefined;
  const inference = inferenceCostOf(billing, timing, usedTools);
  return [
    buildToolFigures(billing, inference, showCost),
    buildTokenFigures(usage, timing, inference, showCost),
  ].filter((line) => line.length > 0);
}

export function buildGenerationFigures(
  generation: ResponseRecord,
  showCost: boolean = import.meta.env.DEV,
): ResponseFigure[] {
  const { usage, timing, billing } = generation;
  const line = buildTokenFigures(usage, undefined, undefined, false);
  const { firstMs, receivingMs } = timing ?? {};
  if (firstMs !== undefined) {
    line.push({
      key: 'time',
      label: t('llm.stats.time'),
      value: t('llm.stats.timeValue', {
        value: formatNumber((firstMs + (receivingMs ?? 0)) / MS_PER_SECOND, {
          maximumFractionDigits: 1,
        }),
      }),
    });
  }
  const inference = inferenceCostOf(billing, timing, false);
  if (showCost && inference !== undefined) line.push(costFigure('cost', inference));
  return line;
}

export function liveTiming(
  stats: ResponseStats | undefined,
  usage: TokenUsage | undefined,
): ResponseTiming | undefined {
  return stats === undefined ? undefined : timingOf(stats, usage, stats.price);
}

export function useResponseStats(
  chatId: string,
  messageId: string,
  candidate: number,
): ResponseStats | undefined {
  return useResponseStatsStore((state) => state.stats[responseKey(chatId, messageId, candidate)]);
}
