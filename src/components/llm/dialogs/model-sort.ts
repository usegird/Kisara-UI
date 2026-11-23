import type { ModelDetails } from '@/port/llm-port';

export type LlmModelSortKey = 'name' | 'price' | 'created';

export interface LlmModelSort {
  readonly key: LlmModelSortKey;
  readonly ascending: boolean;
}

export const DEFAULT_LLM_MODEL_SORT: LlmModelSort = { key: 'name', ascending: true };

function priceOf(details: ModelDetails | undefined, name: string): number | null {
  const usd = details?.prices.find((price) => price.name === name && price.perToken)?.usd;
  return usd === undefined || usd < 0 ? null : usd;
}

function valuesOf(details: ModelDetails | undefined, key: LlmModelSortKey): (number | null)[] {
  if (key === 'price') return [priceOf(details, 'prompt'), priceOf(details, 'completion')];
  return [details?.created ?? null];
}

function compareValues(
  a: readonly (number | null)[],
  b: readonly (number | null)[],
  ascending: boolean,
): number {
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? null;
    const right = b[index] ?? null;
    if (left === right) continue;
    if (left === null) return 1;
    if (right === null) return -1;
    return ascending ? left - right : right - left;
  }
  return 0;
}

export function sortModels(
  models: readonly string[],
  details: Readonly<Record<string, ModelDetails>>,
  sort: LlmModelSort,
): string[] {
  const byName = (a: string, b: string): number => a.localeCompare(b);
  return [...models].sort((a, b) => {
    if (sort.key === 'name') return sort.ascending ? byName(a, b) : byName(b, a);
    return (
      compareValues(
        valuesOf(details[a], sort.key),
        valuesOf(details[b], sort.key),
        sort.ascending,
      ) || byName(a, b)
    );
  });
}
