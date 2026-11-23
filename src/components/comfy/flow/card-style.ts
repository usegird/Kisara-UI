import type { NodeView } from '@/graph/rows';
import { anchorColor } from '@/styles/slot-color';

export function tint(
  color: string | null | undefined,
  percent: number,
): React.CSSProperties | undefined {
  if (!color) return undefined;
  return {
    backgroundColor: `color-mix(in oklab, ${color} ${String(percent)}%, var(--color-card))`,
  };
}

export function anchorStyle(view: NodeView): React.CSSProperties {
  return { backgroundColor: anchorColor(view.outputs.map((output) => output.type)) };
}
