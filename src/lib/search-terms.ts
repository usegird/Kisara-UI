// ─────────────────────────────
// 検索語の分け方と一致（ComfyUI 非依存）。大小は区別しない。
// 各一覧で分け方を作り直さない（語の区切りが画面ごとに違わないよう）。
// ─────────────────────────────

/** 入力を小文字の語に分ける。空なら空の配列（＝絞り込まない） */
export function searchTerms(query: string): readonly string[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((term) => term.length > 0);
  return [...new Set(terms)];
}

/** 文字列のどれかに、語のどれかが含まれるか。語が無ければ常に一致 */
export function matchesAnyTerm(
  texts: string | readonly string[],
  terms: readonly string[],
): boolean {
  if (terms.length === 0) return true;
  const lowered = (typeof texts === 'string' ? [texts] : texts).map((text) => text.toLowerCase());
  return terms.some((term) => lowered.some((text) => text.includes(term)));
}

/**
 * 文字列のどれかに、語のすべてが含まれるか（AND）。語が無ければ常に一致。
 * 会話のモデルを選ぶ画面だけが使う例外
 */
export function matchesAllTerms(
  texts: string | readonly string[],
  terms: readonly string[],
): boolean {
  const lowered = (typeof texts === 'string' ? [texts] : texts).map((text) => text.toLowerCase());
  return terms.every((term) => lowered.some((text) => text.includes(term)));
}

// ─────────────────────────────
// 絞り込んだ結果の並び。同じ順位どうしは元の並びを保つ（sort は安定）。
// ─────────────────────────────

/** 前方一致を見る名前と、語を探す範囲。一覧ごとに決める */
interface SearchTexts {
  readonly names: readonly string[];
  readonly texts: readonly string[];
}

/**
 * 1 つの項目の順位。「すべての語に当たる」は「当たった語の数が最多」と同じなので、`hits` の
 * 比較で兼ねる
 */
export interface SearchRank {
  readonly prefix: boolean;
  readonly hits: number;
  /**
   * どの語に当たったか。先に書いた語ほど重い（1 語目に当たれば、2 語目以降すべてより重い）。
   * 数が同じときに比べる
   */
  readonly order: number;
}

/** 重みを付ける語の数の上限（これより後ろの語は重みを持たない。桁あふれさせない） */
const ORDER_TERMS = 30;

/** 入力に対する 1 つの項目の順位を求める */
function searchRank(query: string, { names, texts }: SearchTexts): SearchRank {
  return loweredSearchRank(searchQuery(query), {
    names: names.map((name) => name.toLowerCase()),
    texts: texts.map((text) => text.toLowerCase()),
  });
}

/** 入力を一度だけ分けたもの。多くの項目と比べるときに、項目ごとに分け直さない */
interface SearchQuery {
  /** 入力全体（前後の空白を除き、小文字） */
  readonly whole: string;
  readonly terms: readonly string[];
}

/** 入力を、多くの項目と比べられる形に一度だけ分ける */
export function searchQuery(query: string): SearchQuery {
  return { whole: query.trim().toLowerCase(), terms: searchTerms(query) };
}

/** `searchRank` と同じ順位。名前と範囲を前もって小文字にしてあるもの（索引から比べる）用 */
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

/** 上に来るものほど小さい */
export function compareSearchRank(a: SearchRank, b: SearchRank): number {
  return Number(b.prefix) - Number(a.prefix) || b.hits - a.hits || b.order - a.order;
}

/** 並べ直した写しを返す。入力が空なら元の並びのまま */
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
