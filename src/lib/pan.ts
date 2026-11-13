// ─────────────────────────────
// 枠に詰めた画像のはみ出た所を、指した位置に合わせて寄せる。
// 上端で画像の上端、左端で左端を見せる。はみ出ない向きは動かない（object-position の % のため）。
// ─────────────────────────────

/** 割合を百分率にする倍率 */
const PERCENT = 100;

/** 指した位置を、画像を寄せる割合（object-position の %）にする */
export function panPercent(offset: number, size: number): string {
  const percent = Math.min(PERCENT, Math.max(0, (offset / Math.max(1, size)) * PERCENT));
  return `${percent.toFixed(1)}%`;
}

/** 画像の要素に寄せる位置を書く（描き直さないよう、変数を要素に直接書く） */
export function panTo(image: HTMLElement, offsetX: number, offsetY: number): void {
  image.style.setProperty('--pan-x', panPercent(offsetX, image.clientWidth));
  image.style.setProperty('--pan-y', panPercent(offsetY, image.clientHeight));
}

/** 寄せた位置を真ん中に戻す */
export function panReset(image: HTMLElement): void {
  image.style.removeProperty('--pan-x');
  image.style.removeProperty('--pan-y');
}
