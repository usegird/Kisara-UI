export function searchTerms(query: string): readonly string[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((term) => term.length > 0);
  return [...new Set(terms)];
}

export function matchesAnyTerm(
  texts: string | readonly string[],
  terms: readonly string[],
): boolean {
  if (terms.length === 0) return true;
  const lowered = (typeof texts === 'string' ? [texts] : texts).map((text) => text.toLowerCase());
  return terms.some((term) => lowered.some((text) => text.includes(term)));
}

export function matchesAllTerms(
  texts: string | readonly string[],
  terms: readonly string[],
): boolean {
  const lowered = (typeof texts === 'string' ? [texts] : texts).map((text) => text.toLowerCase());
  return terms.every((term) => lowered.some((text) => text.includes(term)));
}

interface SearchTexts {
  readonly names: readonly string[];
  readonly texts: readonly string[];
}

export interface SearchRank {
  readonly prefix: boolean;
  readonly hits: number;
  readonly order: number;
}

const ORDER_TERMS = 30;

function searchRank(query: string, { names, texts }: SearchTexts): SearchRank {
  return loweredSearchRank(searchQuery(query), {
    names: names.map((name) => name.toLowerCase()),
    texts: texts.map((text) => text.toLowerCase()),
  });
}

interface SearchQuery {
  readonly whole: string;
  readonly terms: readonly string[];
}

export function searchQuery(query: string): SearchQuery {
  return { whole: query.trim().toLowerCase(), terms: searchTerms(query) };
}

export function loweredSearchRank(
  { whole, terms }: SearchQuery,
  { names, texts }: SearchTexts,
): SearchRank {
  let hits = 0;
  let order = 0;
  terms.forEach((term, index) => {
    if (!texts.some((text) => text.includes(term))) return;
    hits += 1;
    if (index < ORDER_TERMS) order += 2 ** (ORDER_TERMS - 1 - index);
  });
  return {
    prefix: whole.length > 0 && names.some((name) => name.startsWith(whole)),
    hits,
    order,
  };
}

export function compareSearchRank(a: SearchRank, b: SearchRank): number {
  return Number(b.prefix) - Number(a.prefix) || b.hits - a.hits || b.order - a.order;
}

export function rankBySearch<T>(
  items: readonly T[],
  query: string,
  textsOf: (item: T) => SearchTexts,
): T[] {
  if (searchTerms(query).length === 0) return [...items];

  return items
    .map((item) => ({ item, rank: searchRank(query, textsOf(item)) }))
    .sort((a, b) => compareSearchRank(a.rank, b.rank))
    .map((entry) => entry.item);
}
