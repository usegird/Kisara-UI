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

// ─────────────────────────────
// 応答の情報の行の組み立てと、候補の受け取りの記録の購読（描くのは ResponseStats.tsx）。
// ─────────────────────────────

/** 出す 1 項目（名前と値） */
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
      // 引き算の誤差で負にならないようにする
      usd: formatNumber(Math.max(0, usd), { maximumFractionDigits: 6 }),
    }),
  };
}

/** モデルの推論の費用。API が返した値を先に使い、無ければ送った時点のモデルの費用で計算した値 */
function inferenceCostOf(
  billing: ToolBilling | undefined,
  timing: ResponseTiming | undefined,
  usedTools: boolean,
): number | undefined {
  if (billing?.inferenceCost !== undefined) return billing.inferenceCost;
  // ツールを使っていなければ、API が返した費用はすべて推論の分
  if (!usedTools && billing?.cost !== undefined) return billing.cost;
  return timing?.referenceUsd;
}

/** サーバー側のツールの行（Web 検索・取得・ツールの実行の回数と、その費用） */
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

/** キャッシュの読み・書き。どちらも 0 でないときだけ出す（返さないサーバーでは出さない） */
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

/** トークンの処理の行（数・キャッシュ・スループットと、推論の費用）。時間はスループットの計算にだけ使い、行には出さない */
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

/**
 * 出す行を組み立てる（無い項目・空の行は出さない）。費用は `showCost` のときだけ。既定で開発中だけに
 * するのは、料金の改定に追いつけず誤った額を見せる恐れがあるため
 */
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

/**
 * 会話の候補の外で受け取った応答（呼び出しを作らせる・要約）の 1 行。トークン（入力・出力）・時間（送ってから受け取り
 * 終わるまで）・推論の費用。費用は `showCost` のときだけ（既定は開発中だけ）。無い項目は出さない
 */
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

/** 受け取り中の記録を、残す記録と同じ形にする（無ければ undefined） */
export function liveTiming(
  stats: ResponseStats | undefined,
  usage: TokenUsage | undefined,
): ResponseTiming | undefined {
  return stats === undefined ? undefined : timingOf(stats, usage, stats.price);
}

/** この候補の受け取りの記録（無ければ undefined） */
export function useResponseStats(
  chatId: string,
  messageId: string,
  candidate: number,
): ResponseStats | undefined {
  return useResponseStatsStore((state) => state.stats[responseKey(chatId, messageId, candidate)]);
}
