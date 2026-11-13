import { useRef } from 'react';

import { customColorPair, type NodeSettingsPatch } from '@/graph/node-settings';
import { toHexColor } from '@/lib/color';

// ─────────────────────────────
// カスタムの色選び。ブラウザ標準の色選びを、見えない入力から開く。
// ─────────────────────────────

/** 色選びを開く手続きと、カードに置く見えない入力 */
interface ColorPicker {
  /** 今の色（`bgcolor`）から色選びを開く */
  readonly open: (current: string | null) => void;
  /** カードに置く見えない入力。メニューの中に置かない */
  readonly input: React.ReactNode;
}

/**
 * ブラウザ標準の色選びでカスタムの色を選ばせる。入力はメニューの外（カード）に置く
 * （メニューの中に置くと、選んでいる途中でメニューが閉じて一緒に消える）。
 * 選んでいる間も書き込み、その場で色が変わる
 */
export function useColorPicker(
  nodeId: number,
  onSettingsChange: ((id: number, patch: NodeSettingsPatch) => void) | undefined,
): ColorPicker {
  const ref = useRef<HTMLInputElement | null>(null);

  const open = (current: string | null): void => {
    const element = ref.current;
    if (!element) return;
    // 色選びは #rrggbb しか受けない。今の色が読めなければ暗い灰色から始める
    element.value = (current === null ? null : toHexColor(current)) ?? '#353535';
    try {
      element.showPicker();
    } catch {
      element.click();
    }
  };

  const input = onSettingsChange ? (
    <input
      ref={ref}
      type="color"
      tabIndex={-1}
      aria-hidden
      className="pointer-events-none absolute top-0 right-0 size-0 opacity-0"
      onChange={(event) => {
        const pair = customColorPair(event.target.value);
        if (pair) onSettingsChange(nodeId, pair);
      }}
    />
  ) : null;

  return { open, input };
}
