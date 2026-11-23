import { isDelimiterAt, isInsideBrackets } from '@/graph/prompt-delimiters';

const WEIGHT_STEP = 0.1;
const MIN_WEIGHT = 0.1;
const BARE_WEIGHT = 1.1;
const NEUTRAL_WEIGHT = 1;
const TENTHS = 10;
const WEIGHT_TAIL = /^([\s\S]*):\s*(-?\d+(?:\.\d+)?)\s*$/;
const ESCAPE = '\\';

export interface WeightEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly selection: { readonly start: number; readonly end: number };
}

export function adjustWeight(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  direction: 1 | -1,
): WeightEdit | null {
  const delta = direction * WEIGHT_STEP;
  if (selectionStart === selectionEnd) {
    const group = enclosingGroup(text, selectionStart, selectionStart);
    if (group !== null) return reweight(text, group, delta, selectionStart);
    const word = wordAt(text, selectionStart);
    if (word === null) return null;
    const caret = selectionStart + 1;
    return wrap(text, word, delta, { start: caret, end: caret });
  }
  const range = trimRange(text, selectionStart, selectionEnd);
  if (range === null) return null;
  const group = selectedGroup(text, range) ?? enclosingGroup(text, range.start, range.end);
  if (group !== null && (group.open === range.start || bodyOf(text, group).equals(range))) {
    return reweight(text, group, delta, null);
  }
  return wrap(text, range, delta, null);
}

function wrap(
  text: string,
  range: { readonly start: number; readonly end: number },
  delta: number,
  selection: { readonly start: number; readonly end: number } | null,
): WeightEdit {
  const next = roundWeight(NEUTRAL_WEIGHT + delta);
  const body = text.slice(range.start, range.end);
  return {
    start: range.start,
    end: range.end,
    text: `(${body}:${formatWeight(next)})`,
    selection: selection ?? { start: range.start + 1, end: range.start + 1 + body.length },
  };
}

function wordAt(text: string, caret: number): { start: number; end: number } | null {
  const bracketed = isInsideBrackets(text, caret);
  let start = caret;
  while (start > 0 && !isDelimiterAt(text, start - 1, bracketed)) start--;
  let end = caret;
  while (end < text.length && !isDelimiterAt(text, end, bracketed)) end++;
  return start === end ? null : { start, end };
}

interface Group {
  readonly open: number;
  readonly close: number;
}

interface Body {
  readonly start: number;
  readonly end: number;
  readonly weight: number;
  readonly equals: (range: { readonly start: number; readonly end: number }) => boolean;
}

function enclosingGroup(text: string, start: number, end: number): Group | null {
  let depth = 0;
  for (let open = start - 1; open >= 0; open--) {
    const char = text[open];
    if (isEscaped(text, open)) continue;
    if (char === ')') depth++;
    else if (char === '(') {
      if (depth > 0) {
        depth--;
        continue;
      }
      const close = matchingClose(text, open);
      if (close !== null && close >= end) return { open, close };
    }
  }
  return null;
}

function selectedGroup(text: string, range: { start: number; end: number }): Group | null {
  if (text[range.start] !== '(' || isEscaped(text, range.start)) return null;
  const close = matchingClose(text, range.start);
  return close === range.end - 1 ? { open: range.start, close } : null;
}

function matchingClose(text: string, open: number): number | null {
  let depth = 0;
  for (let index = open + 1; index < text.length; index++) {
    if (isEscaped(text, index)) continue;
    if (text[index] === '(') depth++;
    else if (text[index] === ')') {
      if (depth === 0) return index;
      depth--;
    }
  }
  return null;
}

function isEscaped(text: string, index: number): boolean {
  return index > 0 && text[index - 1] === ESCAPE;
}

function bodyOf(text: string, group: Group): Body {
  const inner = text.slice(group.open + 1, group.close);
  const weighted = WEIGHT_TAIL.exec(inner);
  const raw = weighted?.[1] ?? inner;
  const lead = raw.length - raw.trimStart().length;
  const start = group.open + 1 + lead;
  const end = group.open + 1 + raw.trimEnd().length;
  const weight = weighted === null ? BARE_WEIGHT : Number(weighted[2]);
  return {
    start,
    end,
    weight,
    equals: (range) => range.start === start && range.end === end,
  };
}

function reweight(
  text: string,
  group: Group,
  delta: number,
  caret: number | null,
): WeightEdit | null {
  const body = bodyOf(text, group);
  const next = roundWeight(body.weight + delta);
  if (next < MIN_WEIGHT) return null;
  const inner = text.slice(body.start, body.end);
  const neutral = next === NEUTRAL_WEIGHT;
  const replaced = neutral ? inner : `(${inner}:${formatWeight(next)})`;
  const bodyStart = group.open + (neutral ? 0 : 1);
  const selection =
    caret === null
      ? { start: bodyStart, end: bodyStart + inner.length }
      : caretAfter(caret, body, bodyStart, inner.length);
  return { start: group.open, end: group.close + 1, text: replaced, selection };
}

function caretAfter(
  caret: number,
  body: Body,
  bodyStart: number,
  length: number,
): { start: number; end: number } {
  const offset = Math.min(Math.max(caret - body.start, 0), length);
  return { start: bodyStart + offset, end: bodyStart + offset };
}

function trimRange(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } | null {
  const selected = text.slice(start, end);
  const lead = selected.length - selected.trimStart().length;
  const trimmed = selected.trim();
  return trimmed.length === 0 ? null : { start: start + lead, end: start + lead + trimmed.length };
}

function roundWeight(weight: number): number {
  return Math.round(weight * TENTHS) / TENTHS;
}

function formatWeight(weight: number): string {
  return weight.toFixed(1);
}
