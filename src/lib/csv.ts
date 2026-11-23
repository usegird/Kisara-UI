const QUOTE = '"';

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

function formatCell(cell: string): string {
  if (!/[",\r\n]/.test(cell)) return cell;
  return `${QUOTE}${cell.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`;
}

export function formatCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => `${row.map(formatCell).join(',')}\n`).join('');
}
