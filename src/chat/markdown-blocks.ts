// ─────────────────────────────
// 本文を Markdown の塊に分ける。受け取り中に確定した塊を描き直さないため、塊ごとに描く。
// ─────────────────────────────

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** 空行で区切った塊の列。空の本文なら空の列 */
export function splitMarkdownBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  // 開いているコードブロックの囲み（`` ``` `` か `~~~` とその長さ）。外なら null
  let fence: string | null = null;
  let blank = false;

  const close = (): void => {
    const block = current.join('\n').trim();
    if (block.length > 0) blocks.push(block);
    current = [];
  };

  for (const line of lines) {
    const marker = FENCE.exec(line)?.[1];
    if (fence === null) {
      const isBlank = line.trim().length === 0;
      // 字下げされた行は手前の箇条書きの続きなので、空行の後でも区切らない
      if (!isBlank && blank && !/^[ \t]/.test(line)) close();
      if (marker !== undefined) fence = marker;
      blank = isBlank;
    } else if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
      fence = null;
      blank = false;
    }
    current.push(line);
  }
  close();
  return blocks;
}
