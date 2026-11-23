export const VARIABLE_PANEL_METRICS = {
  BOX_HEIGHT: 22,
  BOX_GAP: 2,
  LABEL_HEIGHT: 15,
  GROUP_PADDING: 3,
  GROUP_GAP: 6,
  FRAME_TAB_HEIGHT: 16,
  FRAME_PADDING: 6,
  FRAME_SIDE_PADDING: 4,
  LEFT_GUTTER: 18,
  COLUMN_TOP_PADDING: 0,
} as const;

export function groupHeight(
  count: number,
  padding: number = VARIABLE_PANEL_METRICS.GROUP_PADDING,
  gap: number = VARIABLE_PANEL_METRICS.BOX_GAP,
): number {
  const m = VARIABLE_PANEL_METRICS;
  return m.LABEL_HEIGHT + count * m.BOX_HEIGHT + (count - 1) * gap + padding * 2;
}
