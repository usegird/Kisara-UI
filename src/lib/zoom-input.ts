const WHEEL_STEP = 50;

const LINE_PX = 40;
const PAGE_PX = 800;

const ZOOM_IN_CODES = new Set(['Equal', 'Semicolon', 'NumpadAdd']);
const ZOOM_OUT_CODES = new Set(['Minus', 'NumpadSubtract']);
const RESET_CODES = new Set(['Digit0', 'Numpad0']);

export const OWN_ZOOM_MARK = 'data-own-zoom';

export function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * LINE_PX;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * PAGE_PX;
  return event.deltaY;
}

export function zoomKey(event: KeyboardEvent): 1 | -1 | 'reset' | null {
  if (event.shiftKey) return null;
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && !event.altKey && RESET_CODES.has(event.code)) return 'reset';
  if (event.altKey && !ctrl && ZOOM_IN_CODES.has(event.code)) return 1;
  if (event.altKey && !ctrl && ZOOM_OUT_CODES.has(event.code)) return -1;
  return null;
}

export function insideOwnZoom(target: Element): boolean {
  return target.closest(`[${OWN_ZOOM_MARK}]`) !== null;
}

export interface WheelHeld<K> {
  readonly key: K;
  readonly amount: number;
}

export function accumulateWheel<K>(
  held: WheelHeld<K> | null,
  key: K,
  pixels: number,
): { readonly direction: number; readonly held: WheelHeld<K> | null } {
  const amount = (held?.key === key ? held.amount : 0) + pixels;
  if (Math.abs(amount) < WHEEL_STEP) return { direction: 0, held: { key, amount } };
  return { direction: -Math.sign(amount), held: null };
}
