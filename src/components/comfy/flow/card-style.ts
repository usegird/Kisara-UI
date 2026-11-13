import type { NodeView } from '@/graph/rows';
import { anchorColor } from '@/styles/slot-color';

// ─────────────────────────────
// カードの色の混ぜ方と出力アンカーの点の色。見出し・本体・下端の欄で共通
// ─────────────────────────────

/**
 * ノードの色（標準キー `color` / `bgcolor`）をカードの地へ混ぜた塗り。色が無ければ塗らない。
 * 本体の色は暗い前提なので、そのまま塗らず淡くする（明るい画面でも文字を読めるように）
 */
export function tint(
  color: string | null | undefined,
  percent: number,
): React.CSSProperties | undefined {
  if (!color) return undefined;
  return {
    backgroundColor: `color-mix(in oklab, ${color} ${String(percent)}%, var(--color-card))`,
  };
}

/** 出力アンカーの点の色。出力の型を混ぜる */
export function anchorStyle(view: NodeView): React.CSSProperties {
  return { backgroundColor: anchorColor(view.outputs.map((output) => output.type)) };
}
