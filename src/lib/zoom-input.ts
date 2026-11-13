// ─────────────────────────────
// 倍率を変える操作の読み取り。列とダイアログが同じ操作で倍率を変えるので、
// ホイールの量とキーの読み取りをここに 1 つだけ置く。
// ─────────────────────────────

/** これだけ回したら 1 刻み（画面の px）。マウスの 1 目盛りがおよそ 100 */
const WHEEL_STEP = 50;

/** 行・頁単位で来たホイールを px に直す倍数 */
const LINE_PX = 40;
const PAGE_PX = 800;

/**
 * Alt と一緒に押したら広げる・縮めるキー（配列に依らないよう物理キーで見る）。
 * Ctrl＋`+` / `-` はブラウザのものなので使わない
 */
const ZOOM_IN_CODES = new Set(['Equal', 'Semicolon', 'NumpadAdd']);
const ZOOM_OUT_CODES = new Set(['Minus', 'NumpadSubtract']);
const RESET_CODES = new Set(['Digit0', 'Numpad0']);

/**
 * 自分で倍率を持つ所（ダイアログ）の目印。この中の操作は列の倍率に回さない
 */
export const OWN_ZOOM_MARK = 'data-own-zoom';

/** ホイールの量を画面の px に揃える（行・頁単位で来るものを直す） */
export function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * LINE_PX;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * PAGE_PX;
  return event.deltaY;
}

/** キーが倍率の操作か。広げる 1・縮める -1・等倍 `reset`、ほかは null */
export function zoomKey(event: KeyboardEvent): 1 | -1 | 'reset' | null {
  if (event.shiftKey) return null;
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && !event.altKey && RESET_CODES.has(event.code)) return 'reset';
  if (event.altKey && !ctrl && ZOOM_IN_CODES.has(event.code)) return 1;
  if (event.altKey && !ctrl && ZOOM_OUT_CODES.has(event.code)) return -1;
  return null;
}

/** 要素が自分で倍率を持つ所の中か */
export function insideOwnZoom(target: Element): boolean {
  return target.closest(`[${OWN_ZOOM_MARK}]`) !== null;
}

/** 少しずつ届くホイール（トラックパッド）を貯めたもの */
export interface WheelHeld<K> {
  readonly key: K;
  readonly amount: number;
}

/**
 * ホイールを貯めて、一定量に達したら刻みの向き（上へ回すと広げる 1）を返す。
 * 達していなければ 0 と、次に持ち越す貯め
 */
export function accumulateWheel<K>(
  held: WheelHeld<K> | null,
  key: K,
  pixels: number,
): { readonly direction: number; readonly held: WheelHeld<K> | null } {
  const amount = (held?.key === key ? held.amount : 0) + pixels;
  if (Math.abs(amount) < WHEEL_STEP) return { direction: 0, held: { key, amount } };
  return { direction: -Math.sign(amount), held: null };
}
