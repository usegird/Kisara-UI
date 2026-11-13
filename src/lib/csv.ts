// ─────────────────────────────
// 区切りの表（CSV）の読みと組み立て。**囲みの規則に従う**（RFC 4180）。
// 表の意味は知らない（見出しの解釈は上の層）。ここは文字列と欄の並びだけを扱う。
// ─────────────────────────────

// 引用符で囲まれた欄には、区切り・改行・引用符が入る。欄の中の引用符は 2 つ重ねる。
// 行の区切りは CRLF でも LF でも読む

const QUOTE = '"';

/**
 * 表を欄の並びに分解する。**空の行は落とす**（末尾の改行で空行が増えるため）。
 * 先頭の BOM は呼び出し側で落としてから渡す。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    // 「空の欄 1 つだけ」の行は、行区切りの余りなので落とす
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index] ?? '';

    if (quoted) {
      if (char !== QUOTE) {
        field += char;
        index += 1;
        continue;
      }
      // 2 つ重なっていれば引用符そのもの、そうでなければ囲みの終わり
      if (text[index + 1] === QUOTE) {
        field += QUOTE;
        index += 2;
        continue;
      }
      quoted = false;
      index += 1;
      continue;
    }

    if (char === QUOTE && field.length === 0) {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ',') {
      endField();
      index += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      endRow();
      index += char === '\r' && text[index + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) endRow();

  return rows;
}

/** 区切り・改行・引用符を含む欄だけを囲む（`parseCsv` で読み戻せる形） */
function formatCell(cell: string): string {
  if (!/[",\r\n]/.test(cell)) return cell;
  return `${QUOTE}${cell.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`;
}

/** 行の並びを表にする。行の区切りは LF で、末尾にも付ける。行が無ければ空 */
export function formatCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => `${row.map(formatCell).join(',')}\n`).join('');
}
