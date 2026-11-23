export interface CaretRect {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
}

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

export function caretRectOf(field: HTMLTextAreaElement, index: number): CaretRect {
  const owner = field.ownerDocument;
  const mirror = createTextMirror(field);
  const marker = owner.createElement('span');
  mirror.style.visibility = 'hidden';
  mirror.textContent = field.value.slice(0, index);
  marker.textContent = field.value.slice(index) || '​';
  mirror.append(marker);
  owner.body.append(mirror);

  const rect = marker.getClientRects()[0] ?? marker.getBoundingClientRect();
  mirror.remove();
  const left = rect.left - field.scrollLeft;
  const top = rect.top - field.scrollTop;
  return { left, top, bottom: top + rect.height };
}

export function createTextMirror(field: HTMLTextAreaElement): HTMLDivElement {
  const owner = field.ownerDocument;
  const style = owner.defaultView?.getComputedStyle(field);
  const mirror = owner.createElement('div');
  const box = field.getBoundingClientRect();
  for (const property of COPIED_PROPERTIES) mirror.style[property] = style?.[property] ?? '';
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

function scrollbarWidthOf(
  field: HTMLTextAreaElement,
  style: CSSStyleDeclaration | undefined,
): number {
  const borders =
    parseFloat(style?.borderLeftWidth ?? '0') + parseFloat(style?.borderRightWidth ?? '0');
  const width = field.offsetWidth - field.clientWidth - (Number.isFinite(borders) ? borders : 0);
  return Math.max(width, 0);
}
