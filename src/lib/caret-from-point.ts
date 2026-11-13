// ─────────────────────────────
// 押した位置が、文字の何文字目か。表示の文字を押して入力欄に変えるとき、
// 押した所にキャレットを置くのに使う。
// ─────────────────────────────

// 標準は `caretPositionFromPoint`。無いブラウザ（古い Safari など）は `caretRangeFromPoint`。
// どちらも無い環境（テストの環境）なら null（呼び出し側で末尾に置く）

interface CaretSpot {
  readonly node: Node;
  readonly offset: number;
}

function caretSpotAt(doc: Document, x: number, y: number): CaretSpot | null {
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }
  // 標準の方が無いときだけ使う（非推奨だが Safari 17 以前はこちらしか無い）
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }
  return null;
}

/** `within` の文字の中で、画面上の位置（`clientX` / `clientY`）が指す文字の位置 */
export function caretOffsetAt(within: Element, x: number, y: number): number | null {
  const spot = caretSpotAt(within.ownerDocument, x, y);
  if (spot === null || !within.contains(spot.node)) return null;

  // 押した文字の手前にある文字をすべて数える（文字が複数の塊に分かれていても通す）
  const walker = within.ownerDocument.createTreeWalker(within, NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node === spot.node) return offset + spot.offset;
    offset += node.textContent?.length ?? 0;
  }
  // 文字でない所（要素そのもの）を指したときは、その子の並びの位置になる。先頭か末尾に寄せる
  return spot.offset === 0 ? 0 : offset;
}

/**
 * 入力欄（textarea / input）の中で、画面上の位置が指す文字の位置。取れなければ null。
 * 標準の `caretPositionFromPoint` は欄そのもの（実装によっては欄の中の文字）を返す。
 * 古い `caretRangeFromPoint` は欄の中を指せないので使わない
 */
export function textFieldOffsetAt(
  field: HTMLInputElement | HTMLTextAreaElement,
  x: number,
  y: number,
): number | null {
  const doc = field.ownerDocument;
  if (typeof doc.caretPositionFromPoint !== 'function') return null;

  const position = doc.caretPositionFromPoint(x, y);
  if (position === null) return null;
  const node = position.offsetNode;
  // 欄そのもの、または欄の中（ブラウザが持つ内側の文字）を指したときだけ受ける
  const inside = node === field || (node.getRootNode() as { host?: unknown }).host === field;
  return inside ? Math.min(position.offset, field.value.length) : null;
}
