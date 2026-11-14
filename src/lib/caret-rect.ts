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
  const mirror = createTextMirror(field);
  const marker = owner.createElement('span');
  mirror.style.visibility = 'hidden';
  mirror.textContent = field.value.slice(0, index);
  // 印にはキャレットから後ろの文字をそのまま入れる。語は残りまで揃わないと欄と同じ所で折り返さない
  // （語の途中のキャレットが前の行に残る）。後ろが無ければ、高さを持たせるために幅 0 の字を入れる
  marker.textContent = field.value.slice(index) || '​';
  mirror.append(marker);
  owner.body.append(mirror);

  // 後ろの文字は何行にもまたがるので、キャレットの位置は最初の 1 片で読む
  const rect = marker.getClientRects()[0] ?? marker.getBoundingClientRect();
  mirror.remove();
  const left = rect.left - field.scrollLeft;
  const top = rect.top - field.scrollTop;
  return { left, top, bottom: top + rect.height };
}

/**
 * 欄と同じ字の組み方の写し（中身は空）。欄の位置に重ねて置く形にしてあり、文書へ足すのは呼び出し側。
 * 位置を測るとき・入れた文字の動きを見せるときに使う
 */
export function createTextMirror(field: HTMLTextAreaElement): HTMLDivElement {
  const owner = field.ownerDocument;
  const style = owner.defaultView?.getComputedStyle(field);
  const mirror = owner.createElement('div');
  const box = field.getBoundingClientRect();
  for (const property of COPIED_PROPERTIES) mirror.style[property] = style?.[property] ?? '';
  // 欄の送りのバーは字を組む幅を狭める。写しはバーを出さないので、同じ幅を右の余白に足して
  // 折り返しを揃える（揃えないと写しの行が少なくなり、下の方ほど位置が上にずれる）
  const scrollbar = scrollbarWidthOf(field, style);
  if (scrollbar > 0) {
    mirror.style.paddingRight = `${String(parseFloat(style?.paddingRight ?? '0') + scrollbar)}px`;
  }
  Object.assign(mirror.style, {
    position: 'fixed',
    left: `${String(box.left)}px`,
    top: `${String(box.top)}px`,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    overflow: 'hidden',
  });
  return mirror;
}

/** 欄の縦の送りのバーの幅（px）。出ていなければ 0 */
function scrollbarWidthOf(
  field: HTMLTextAreaElement,
  style: CSSStyleDeclaration | undefined,
): number {
  const borders =
    parseFloat(style?.borderLeftWidth ?? '0') + parseFloat(style?.borderRightWidth ?? '0');
  const width = field.offsetWidth - field.clientWidth - (Number.isFinite(borders) ? borders : 0);
  return Math.max(width, 0);
}
