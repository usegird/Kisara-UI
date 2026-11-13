import { t } from '@/i18n';
import { formatNumber } from '@/i18n/format';
import type { ModelPrice } from '@/port/llm-port';

// ─────────────────────────────
// モデルの費用の書き方。モデルを選ぶ画面の情報の列と、一覧の 2 行目で同じにする。
// ─────────────────────────────

const MILLION = 1_000_000;

/** 浮動小数の端数を丸めた米ドルの数（1M あたりは 4 桁、返った値のままは 8 桁まで） */
function formatUsd(price: ModelPrice): string {
  return price.perToken
    ? formatNumber(price.usd * MILLION, { maximumFractionDigits: 4 })
    : formatNumber(price.usd, { maximumFractionDigits: 8 });
}

/**
 * 費用が決まっていないか。ルーター（`openrouter/auto` など）は `-1` を返す
 */
function isVariablePrice(price: ModelPrice): boolean {
  return price.usd < 0;
}

/** 情報の列の値（`$0.1 / 1M トークン`・`$0.01`・変動） */
export function formatPrice(price: ModelPrice): string {
  if (isVariablePrice(price)) return t('llm.modelPicker.info.variable');
  const usd = formatUsd(price);
  return price.perToken
    ? t('llm.modelPicker.info.perMillion', { usd })
    : t('llm.modelPicker.info.usd', { usd });
}

/** 一覧の 2 行目（`prompt $0.1/1M · completion $0.5/1M …`）。1 行に収まらない分は表示側で省く */
export function formatPrices(prices: readonly ModelPrice[]): string {
  return prices
    .map((price) =>
      isVariablePrice(price)
        ? t('llm.modelPicker.row.variable', { name: price.name })
        : t(price.perToken ? 'llm.modelPicker.row.perMillion' : 'llm.modelPicker.row.usd', {
            name: price.name,
            usd: formatUsd(price),
          }),
    )
    .join(' · ');
}
