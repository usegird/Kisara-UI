// ─────────────────────────────
// 画面上の点の型。座標計算（接続線・端に重ねる欄・アンカー）が共有する。
// ─────────────────────────────

/** 画面上の点 */
export interface Point {
  readonly x: number;
  readonly y: number;
}
