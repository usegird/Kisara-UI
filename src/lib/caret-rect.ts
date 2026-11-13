// ─────────────────────────────
// 複数行の欄の中で、ある文字の位置が画面のどこにあるか。欄と同じ字の組み方の見えない写しを置き、
// その位置の印の場所を読む（textarea は文字の位置を返す仕組みを持たないため）。
// ─────────────────────────────

/** 画面の上のキャレットの位置（ビューポートの座標） */
export interface CaretRect {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
}

/** 字の組み方に効く値。写しに同じものを当てる */
const COPIED_PROPERTIES = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'tabSize',
  'textIndent',
  'textTransform',
  'wordSpacing',
] as const;

/**
 * 欄の `index` 文字目の位置。測るたびに写しを作って消す（位置を持ち続けず、候補を出すその場で読むだけ）。
 * 欄の中のスクロールを差し引く
 */
export function caretRectOf(field: HTMLTextAreaElement, index: number): CaretRect {
  const owner = field.ownerDocument;
  const style = owner.defaultView?.getComputedStyle(field);
  const mirror = owner.createElement('div');
  const marker = owner.createElement('span');
  const box = field.getBoundingClientRect();

  for (const property of COPIED_PROPERTIES) mirror.style[property] = style?.[property] ?? '';
  Object.assign(mirror.style, {
    position: 'fixed',
    visibility: 'hidden',
    left: `${String(box.left)}px`,
    top: `${String(box.top)}px`,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    overflow: 'hidden',
  });
  mirror.textContent = field.value.slice(0, index);
  // 空の印は高さを持たないので、1 文字ぶんの字を入れる
  marker.textContent = '​';
  mirror.append(marker);
  owner.body.append(mirror);

  const rect = marker.getBoundingClientRect();
  mirror.remove();
  const left = rect.left - field.scrollLeft;
  const top = rect.top - field.scrollTop;
  return { left, top, bottom: top + rect.height };
}
