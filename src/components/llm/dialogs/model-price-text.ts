import { t } from '@/i18n';
import { formatNumber } from '@/i18n/format';
import type { ModelPrice } from '@/port/llm-port';

const MILLION = 1_000_000;

function formatUsd(price: ModelPrice): string {
  return price.perToken
    ? formatNumber(price.usd * MILLION, { maximumFractionDigits: 4 })
    : formatNumber(price.usd, { maximumFractionDigits: 8 });
}

function isVariablePrice(price: ModelPrice): boolean {
  return price.usd < 0;
}

export function formatPrice(price: ModelPrice): string {
  if (isVariablePrice(price)) return t('llm.modelPicker.info.variable');
  const usd = formatUsd(price);
  return price.perToken
    ? t('llm.modelPicker.info.perMillion', { usd })
    : t('llm.modelPicker.info.usd', { usd });
}

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
