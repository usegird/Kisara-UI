// ─────────────────────────────
// 結果画像などを重ねる範囲の横幅。座標はすべて中身（測定の原点）から見た位置で、測るのは
// 呼び出し側（座標の測定は 1 本の仕組みに任せる）。
// ─────────────────────────────

/**
 * 重ねる範囲。**アプリ入力より右の、見えている範囲だけ**を覆う。中身は横にはみ出すので、
 * 中身の幅いっぱいに広げると送った先が画面の外へ出て欠ける
 */
interface OverlaySpan {
  readonly left: number;
  readonly width: number;
}

/**
 * `start` は覆い始める位置（アプリ入力の右）。`viewport` は横に送る枠の見えている範囲。
 * 見えている範囲が分からなければ null（呼び出し側は中身の右端まで広げる）。
 * アプリ入力が見えている範囲を占めきるときは幅 0
 */
export function overlaySpan(
  start: number,
  viewport: { readonly left: number; readonly right: number } | undefined,
): OverlaySpan | null {
  if (viewport === undefined) return null;

  const left = Math.max(start, viewport.left);
  return { left, width: Math.max(0, viewport.right - left) };
}
