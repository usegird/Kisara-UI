// ─────────────────────────────
// プロンプトの重み（`(語:1.1)`）を 0.1 ずつ増減する。選んだ範囲か、キャレットを囲む括弧・語に効かせる。純関数。
// ─────────────────────────────

/** 1 回の増減の幅 */
const WEIGHT_STEP = 0.1;
/** 重みの下限（0 にはしない） */
const MIN_WEIGHT = 0.1;
/** 重みの無い括弧の重み（ComfyUI の `(語)` と同じ） */
const BARE_WEIGHT = 1.1;
/** この重みになったら括弧を外す */
const NEUTRAL_WEIGHT = 1;
/** 小数 1 桁に丸める倍率 */
const TENTHS = 10;
/** 括弧の中身の末尾の重み（`語:1.2`） */
const WEIGHT_TAIL = /^([\s\S]*):\s*(-?\d+(?:\.\d+)?)\s*$/;
const ESCAPE = '\\';
/** 語を区切る文字（空白と括弧のほかに） */
const WORD_SEPARATOR = ',';

/** 書き換えの結果。`start`〜`end` を `text` で置き換え、その後に `selection` を選ぶ */
export interface WeightEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** 置き換えた後の選び（全体の文字の位置） */
  readonly selection: { readonly start: number; readonly end: number };
}

/**
 * 重みを増減する書き換えを返す。効かせる先が無い（選んでいない・括弧の外・語の上でない）・
 * 下限より下げるときは null。
 * 選んでいれば、その範囲（前後の空白を除く）が括弧の中身そのものならその括弧を、ほかは選んだ範囲を
 * `(…:1.1)`・`(…:0.9)` で包む。選んでいなければキャレットを囲む一番内側の括弧を変え、括弧の外なら
 * キャレットが乗っている語を包む。
 * 1.0 になったら括弧を外す
 * @param direction - 1 で増やし、-1 で減らす
 */
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
    // 包んだ後もキャレットを語の中の同じ位置に置く（`(` の分だけ後ろへ）
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

/** `range` を `(…:1.1)`・`(…:0.9)` で包む。`selection` を省くと中身を選ぶ */
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

// ─────────────────────────────
// 語
// ─────────────────────────────

/**
 * キャレットが乗っている語（左右の端を含む）。空白・`,`・括弧で区切る（`\(` は語の文字）。
 * キャレットの前後がどちらも語の文字でなければ null
 */
function wordAt(text: string, caret: number): { start: number; end: number } | null {
  let start = caret;
  while (start > 0 && isWordChar(text, start - 1)) start--;
  let end = caret;
  while (end < text.length && isWordChar(text, end)) end++;
  return start === end ? null : { start, end };
}

function isWordChar(text: string, index: number): boolean {
  const char = text[index] ?? '';
  if (char === '(' || char === ')') return isEscaped(text, index);
  return char !== WORD_SEPARATOR && char.trim().length > 0;
}

// ─────────────────────────────
// 括弧
// ─────────────────────────────

/** 括弧 1 組。`open` は `(` の位置、`close` は `)` の位置 */
interface Group {
  readonly open: number;
  readonly close: number;
}

/** 括弧の中身の範囲（重みを除く） */
interface Body {
  readonly start: number;
  readonly end: number;
  readonly weight: number;
  readonly equals: (range: { readonly start: number; readonly end: number }) => boolean;
}

/** `start`〜`end` を囲む一番内側の括弧。`\(` は文字なので数えない。無ければ null */
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

/** 選んだ範囲が括弧ごと（`(…)`）ならその括弧 */
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

/** 括弧の重みを変える。1.0 なら括弧を外す。`caret` は選んでいないときのキャレット */
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

/** 選んでいないときのキャレットを、中身の中の同じ位置に置き直す（中身の外なら中身の端） */
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
