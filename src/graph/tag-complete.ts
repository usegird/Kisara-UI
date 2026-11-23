import { isDelimiterAt, isInsideBrackets } from '@/graph/prompt-delimiters';
import { tagKey, type IndexedTag } from '@/graph/tag-dictionary';

export interface TagToken {
  readonly start: number;
  readonly end: number;
  readonly word: string;
}

export interface TagMatch {
  readonly tag: IndexedTag;
  readonly alias: string | null;
}

export interface TagMatches {
  readonly matches: readonly TagMatch[];
  readonly total: number;
}

const MIN_WORD_LENGTH = 2;
const SYNTAX_PREFIXES = ['<', '__'];
const SYNTAX_OPEN = '<';
const SYNTAX_CLOSE = '>';
const SYNTAX_BOUNDARIES = [',', '\n'];
const NUMBER_ONLY = /^[\d.]+$/;
const WEIGHT_TAIL = /.:[\d.]*$/;
const NON_ASCII = /[^ -~]/;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;
const THOUSAND = 1_000;
const MILLION = 1_000_000;
const ONE_DECIMAL_BELOW = 10;

export function tagTokenAt(text: string, caret: number): TagToken | null {
  const bracketed = isInsideBrackets(text, caret);
  let start = caret;
  while (start > 0 && !isDelimiterAt(text, start - 1, bracketed)) start--;
  const word = text.slice(start, caret);
  if (word.length === 0 || isInsideSyntax(text, start)) return null;
  return { start, end: caret, word };
}

function isInsideSyntax(text: string, start: number): boolean {
  const before = text.slice(0, start);
  const boundary = Math.max(...SYNTAX_BOUNDARIES.map((mark) => before.lastIndexOf(mark)));
  const segment = before.slice(boundary + 1);
  return segment.lastIndexOf(SYNTAX_OPEN) > segment.lastIndexOf(SYNTAX_CLOSE);
}

export function canCompleteWord(word: string, forced: boolean): boolean {
  if (SYNTAX_PREFIXES.some((prefix) => word.startsWith(prefix))) return false;
  if (NUMBER_ONLY.test(word) || WEIGHT_TAIL.test(word)) return false;
  return forced || [...word].length >= MIN_WORD_LENGTH || NON_ASCII.test(word);
}

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

export function tagInsertText(tag: string, following: string): string {
  const spaced = HAS_WORD_CHAR.test(tag) ? tag.replaceAll('_', ' ') : tag;
  const escaped = spaced.replace(/(?<!\\)([()])/g, '\\$1');
  return following.trimStart().startsWith(',') ? escaped : `${escaped}, `;
}

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

function trimDecimal(value: number): string {
  if (value >= ONE_DECIMAL_BELOW) return String(Math.round(value));
  return String(Math.round(value * ONE_DECIMAL_BELOW) / ONE_DECIMAL_BELOW);
}
