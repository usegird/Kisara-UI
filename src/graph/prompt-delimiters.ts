const DELIMITERS = new Set([
  ',',
  '\n',
  '\r',
  ' ',
  '\t',
  '　',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '|',
  '@',
  '~',
]);
const BRACKETED_DELIMITER = ':';
const BRACKETS = new Set(['(', ')', '[', ']', '{', '}']);
const OPEN_BRACKETS = new Set(['(', '[', '{']);
const ESCAPE = '\\';

export function isDelimiterAt(text: string, index: number, bracketed: boolean): boolean {
  const char = text[index] ?? '';
  if (bracketed && char === BRACKETED_DELIMITER) return true;
  if (!DELIMITERS.has(char)) return false;
  return !(BRACKETS.has(char) && isEscapedAt(text, index));
}

export function isEscapedAt(text: string, index: number): boolean {
  return text[index - 1] === ESCAPE;
}

export function isInsideBrackets(text: string, caret: number): boolean {
  let depth = 0;
  for (let index = 0; index < caret; index++) {
    const char = text[index] ?? '';
    if (!BRACKETS.has(char) || isEscapedAt(text, index)) continue;
    depth = OPEN_BRACKETS.has(char) ? depth + 1 : Math.max(0, depth - 1);
  }
  return depth > 0;
}
