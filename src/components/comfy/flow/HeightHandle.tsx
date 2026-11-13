import { useContext } from 'react';

import { ColumnZoomContext } from '@/components/comfy/flow/column-zoom-context';
import {
  HeightHandle as EdgeHeightHandle,
  type HeightHandleProps as EdgeHeightHandleProps,
} from '@/components/ui/height-handle';
import { DEFAULT_MULTILINE_HEIGHT, MIN_MULTILINE_HEIGHT } from '@/graph/multiline-height';
import type { NodeRow } from '@/graph/rows';

// ─────────────────────────────
// カードの高さ・アプリ入力の欄の高さを変える下端の掴み。掴みそのものは共通の部品（`ui/height-handle`）で、
// ここでは列の倍率と、複数行の入力 1 つぶんの下限を足す。
// ─────────────────────────────

/** 下端の掴みの受け取り物（倍率は列から読む） */
export interface HeightHandleProps extends Omit<EdgeHeightHandleProps, 'min' | 'zoom'> {
  /** これより縮めない（px）。既定は複数行の入力 1 つぶんの下限 */
  readonly min?: number | undefined;
}

/** 共通の下端の掴みに、列の倍率と複数行の入力の下限を渡して出す */
export function HeightHandle({
  min = MIN_MULTILINE_HEIGHT,
  ...props
}: HeightHandleProps): React.ReactElement {
  // 列に倍率がかかっていると、動かした量（画面の px）は高さ（列の中の px）より大きく出る
  const zoom = useContext(ColumnZoomContext);
  return <EdgeHeightHandle {...props} min={min} zoom={zoom} />;
}

/** カードの高さの掴みの受け取り物 */
export interface TextHeightHandleProps {
  /** 何の高さかを読み上げるための名前（カードの名前） */
  readonly label: string;
  /**
   * そのカードに**出ている**複数行の入力。動かした量をこの数で分ける（2 つなら 1 つあたり半分）。
   * 空なら掴みを出さない
   */
  readonly rows: readonly NodeRow[];
  /** 複数行の入力 1 つぶんの高さを書く（ノードの `size` に残す） */
  readonly onResizeText: (row: NodeRow, height: number) => void;
}

/**
 * 複数行の入力を持つカードの高さの掴み。アプリ入力は項目ごとに `HeightHandle` を使う。
 * 本体と同じくノードの大きさを変え、複数行の入力は `size` の残りを等分するので、1 つぶんの高さに換算して書く。
 */
export function TextHeightHandle({
  label,
  rows,
  onResizeText,
}: TextHeightHandleProps): React.ReactElement | null {
  const first = rows[0];
  if (!first) return null;

  const parts = rows.length;
  const each = first.height ?? DEFAULT_MULTILINE_HEIGHT;

  return (
    <HeightHandle
      label={label}
      height={each * parts}
      min={MIN_MULTILINE_HEIGHT * parts}
      onChange={(total) => onResizeText(first, total / parts)}
      menuAction
    />
  );
}
