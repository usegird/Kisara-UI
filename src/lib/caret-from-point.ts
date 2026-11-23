interface CaretSpot {
  readonly node: Node;
  readonly offset: number;
}

function caretSpotAt(doc: Document, x: number, y: number): CaretSpot | null {
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }
  return null;
}

export function caretOffsetAt(within: Element, x: number, y: number): number | null {
  const spot = caretSpotAt(within.ownerDocument, x, y);
  if (spot === null || !within.contains(spot.node)) return null;

  const walker = within.ownerDocument.createTreeWalker(within, NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node === spot.node) return offset + spot.offset;
    offset += node.textContent?.length ?? 0;
  }
  return spot.offset === 0 ? 0 : offset;
}

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
  const inside = node === field || (node.getRootNode() as { host?: unknown }).host === field;
  return inside ? Math.min(position.offset, field.value.length) : null;
}
