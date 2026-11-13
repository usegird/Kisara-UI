// ─────────────────────────────
// 変数パネルの寸法。高さの計算に使うため、描画側と共有できる場所に置く。
// カードの高さに比べて場所を取らないよう、できるだけ詰めた値にしている。
// ─────────────────────────────

export const VARIABLE_PANEL_METRICS = {
  /** 変数1件の高さ */
  BOX_HEIGHT: 22,
  /** 変数どうしの間隔 */
  BOX_GAP: 2,
  /** グループ左上のラベル行 */
  LABEL_HEIGHT: 15,
  /** グループ枠の内側の余白 */
  GROUP_PADDING: 3,
  /** グループどうしの間隔 */
  GROUP_GAP: 6,
  /**
   * カードのグループの帯のタブの高さ。帯の中のまとまりは、このぶん下から始める
   */
  FRAME_TAB_HEIGHT: 16,
  /** カードのグループの帯の、タブの下と末尾の余白 */
  FRAME_PADDING: 6,
  /** カードのグループの帯の横の余白。まとまりは右にこのぶん空け、帯は左の空きへ同じぶん出す */
  FRAME_SIDE_PADDING: 4,
  /**
   * 列の左に空ける幅。**枠の外に出すノード追加の三角**の置き場。
   * 列は横にはみ出した分を切るので、外へ出すぶんの場所を内側に作っておく。
   */
  LEFT_GUTTER: 18,
  /**
   * 列の中身の上の余白。アプリ入力・カードの列と同じく足さない（3 列の先頭を揃える）
   */
  COLUMN_TOP_PADDING: 0,
} as const;

/**
 * まとまり 1 つの高さ。`padding` は枠の内側の余白、`gap` は変数の間（デモは広げる）
 */
export function groupHeight(
  count: number,
  padding: number = VARIABLE_PANEL_METRICS.GROUP_PADDING,
  gap: number = VARIABLE_PANEL_METRICS.BOX_GAP,
): number {
  const m = VARIABLE_PANEL_METRICS;
  return m.LABEL_HEIGHT + count * m.BOX_HEIGHT + (count - 1) * gap + padding * 2;
}
