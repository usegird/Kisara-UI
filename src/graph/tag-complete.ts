import { tagKey, type IndexedTag } from '@/graph/tag-dictionary';

// ─────────────────────────────
// タグ補完の当て方（打ちかけの語の切り出し・当たるタグと並び・差し込む文字）。純関数だけを置く。
// ─────────────────────────────

/** 打ちかけの語。`start` から `end`（キャレット）までを置き換える */
export interface TagToken {
  readonly start: number;
  readonly end: number;
  readonly word: string;
}

/** 当たったタグ。別名で当たったときだけ `alias` に当たった別名を持つ */
export interface TagMatch {
  readonly tag: IndexedTag;
  readonly alias: string | null;
}

/** 当たったタグの先頭から `limit` 件と、当たった件数 */
export interface TagMatches {
  readonly matches: readonly TagMatch[];
  readonly total: number;
}

/**
 * 語の区切り。空白を打てばそこから別の語として当てる（全角の空白とタブも同じ）。
 * `\` を前に付けた括弧は区切りにしない
 */
const DELIMITERS = new Set([',', '\n', '\r', ' ', '\t', '　', '(', ')', '[', ']', '{', '}', '|']);
const BRACKETS = new Set(['(', ')', '[', ']', '{', '}']);
const ESCAPE = '\\';
/** 語の頭で無視する印 */
const AT_PREFIX = '@';
/** 当て始める長さ（全角を含む語は 1 文字から） */
const MIN_WORD_LENGTH = 2;
/** Lora（`<lora:…>`）とワイルドカード（`__名前__`）の書式の頭 */
const SYNTAX_PREFIXES = ['<', '__'];
/** 重みを打っている（`tag:1.2`）。頭の `:` は顔文字のタグ（`:3`）なので除く */
const WEIGHT_TAIL = /.:[\d.]*$/;
const NON_ASCII = /[^ -~]/;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;
const THOUSAND = 1_000;
const MILLION = 1_000_000;
const ONE_DECIMAL_BELOW = 10;

function isDelimiterAt(text: string, index: number): boolean {
  const char = text[index] ?? '';
  if (!DELIMITERS.has(char)) return false;
  return !(BRACKETS.has(char) && text[index - 1] === ESCAPE);
}

/**
 * キャレットの前の打ちかけの語（直前の区切りの後ろから）。語が空なら null。
 * 頭の `@` は語に含めず、差し込むときも残す（作者のタグを `@名前` と書くモデルがあるため）
 */
export function tagTokenAt(text: string, caret: number): TagToken | null {
  let start = caret;
  while (start > 0 && !isDelimiterAt(text, start - 1)) start--;
  if (text[start] === AT_PREFIX && start < caret) start++;
  const word = text.slice(start, caret);
  return word.length === 0 ? null : { start, end: caret, word };
}

/**
 * その語で候補を出すか。短い語・Lora とワイルドカードの書式・重みを打っているときは出さない。
 * `forced`（手で開いた）なら短くても出す
 */
export function canCompleteWord(word: string, forced: boolean): boolean {
  if (SYNTAX_PREFIXES.some((prefix) => word.startsWith(prefix))) return false;
  if (WEIGHT_TAIL.test(word)) return false;
  return forced || [...word].length >= MIN_WORD_LENGTH || NON_ASCII.test(word);
}

/** 当たり方。先頭から一致なら 1、途中に含めば 2、当たらなければ 0。別名で当たればその別名 */
function rankOf(tag: IndexedTag, query: string): { rank: number; alias: string | null } {
  if (tag.key.startsWith(query)) return { rank: 1, alias: null };
  const prefixAlias = tag.aliasKeys.findIndex((alias) => alias !== '' && alias.startsWith(query));
  if (prefixAlias >= 0) return { rank: 1, alias: tag.entry.aliases[prefixAlias] ?? null };
  if (tag.key.includes(query)) return { rank: 2, alias: null };
  const innerAlias = tag.aliasKeys.findIndex((alias) => alias !== '' && alias.includes(query));
  if (innerAlias >= 0) return { rank: 2, alias: tag.entry.aliases[innerAlias] ?? null };
  return { rank: 0, alias: null };
}

function byPriority(a: TagMatch, b: TagMatch): number {
  return b.tag.entry.priority - a.tag.entry.priority;
}

/**
 * 語に当たるタグを、先頭から一致 → 途中に含む の順に、それぞれ優先度の高い順で並べる。
 * 語が空なら全件を優先度の高い順。空白で語を分けない（空白を含むタグがあるため）
 */
export function matchTags(tags: readonly IndexedTag[], word: string, limit: number): TagMatches {
  const query = tagKey(word);
  if (query.length === 0) {
    const all = tags.map((tag) => ({ tag, alias: null }));
    return { matches: all.sort(byPriority).slice(0, limit), total: all.length };
  }
  const prefix: TagMatch[] = [];
  const inner: TagMatch[] = [];
  for (const tag of tags) {
    const { rank, alias } = rankOf(tag, query);
    if (rank === 1) prefix.push({ tag, alias });
    else if (rank === 2) inner.push({ tag, alias });
  }
  const sorted = [...prefix.sort(byPriority), ...inner.sort(byPriority)];
  return { matches: sorted.slice(0, limit), total: sorted.length };
}

/**
 * 選んだタグを入れる文字。語のあるタグの `_` を空白にし（記号だけの顔文字は変えない）、
 * 括弧の前に `\` を付け（重みの括弧と区別するため）、`following` の頭が `,` でなければ `, ` を足す
 */
export function tagInsertText(tag: string, following: string): string {
  const spaced = HAS_WORD_CHAR.test(tag) ? tag.replaceAll('_', ' ') : tag;
  const escaped = spaced.replace(/(?<!\\)([()])/g, '\\$1');
  return following.trimStart().startsWith(',') ? escaped : `${escaped}, `;
}

/** 優先度を縮めた表示（1.2k・3.4M）。0 なら空 */
export function formatTagPriority(priority: number): string {
  if (priority <= 0) return '';
  const units: readonly [number, string][] = [
    [MILLION, 'M'],
    [THOUSAND, 'k'],
  ];
  for (const [size, unit] of units) {
    if (priority >= size) return `${trimDecimal(priority / size)}${unit}`;
  }
  return String(Math.round(priority));
}

/** 10 未満は小数 1 桁まで、それ以上は整数に丸める */
function trimDecimal(value: number): string {
  if (value >= ONE_DECIMAL_BELOW) return String(Math.round(value));
  return String(Math.round(value * ONE_DECIMAL_BELOW) / ONE_DECIMAL_BELOW);
}
