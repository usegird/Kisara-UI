import { normalizeInRange } from '@/lib/clamp';

// ─────────────────────────────
// 右の列を下に置いたときの帯の高さ。端末に残す値なので、壊れた保存値は既定に落とす。
// ─────────────────────────────

/** 既定はキューのカードが 2 段ほど見える高さ */
export const DEFAULT_SIDE_PANEL_HEIGHT = 200;
/**
 * 右端に縦に並べたタブ（3 つ）と、その下の縮める・置き場所のアイコンが重ならない高さ。
 * カード 1 段が入る程度の 96px に、タブ 1 つ分（約 26px）を足した値
 */
export const MIN_SIDE_PANEL_HEIGHT = 122;
/** 安全網。実際には本体が潰れないよう、見た目の側でも頭を押さえる */
export const MAX_SIDE_PANEL_HEIGHT = 1200;

/** 範囲外は端に寄せる。数でなければ既定に落とす */
export function normalizeSidePanelHeight(value: unknown): number {
  return normalizeInRange(
    value,
    { initial: DEFAULT_SIDE_PANEL_HEIGHT, min: MIN_SIDE_PANEL_HEIGHT, max: MAX_SIDE_PANEL_HEIGHT },
    { round: true },
  );
}
