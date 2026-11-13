/* eslint-disable react-hooks/refs --
 * useSortable の戻り値（setNodeRef などを含む）がまるごと ref とみなされる誤検知。
 * 描画中に .current を読んではいない。
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cva } from 'class-variance-authority';
import { useContext } from 'react';

import { ROW_GRID } from '@/components/comfy/flow/app-input-look';
import { AppFieldBody } from '@/components/comfy/flow/AppFieldBody';
import { ColumnZoomContext } from '@/components/comfy/flow/column-zoom-context';
import { noLayoutAnimation } from '@/components/comfy/flow/flow-dnd';
import { CHIP_MOTION, type MotionKind } from '@/components/comfy/flow/item-motion';
import { sortableAttributes } from '@/components/ui/drag-announcements';
import { appInputDragId } from '@/graph/app-input-order';
import { appInputSpanKey } from '@/graph/app-inputs';
import type { NodeRow } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { zoomedTransform } from '@/store/settings-fields/column-zoom';

// ─────────────────────────────
// アプリ入力の項目の外側（掴む受け口と位置のずらし）
// ─────────────────────────────

interface AppFieldProps {
  readonly nodeId: NodeId;
  /** 掴んだときに付いてくる枠の見出し */
  readonly group: { readonly index: string | null; readonly label: string };
  readonly row: NodeRow;
  /** 12 分割での幅 */
  readonly span: number;
  /** 複数行の入力の高さ（px）。書いていなければ undefined（既定の高さ） */
  readonly height: number | undefined;
  /** 12 分割の 1 つ分（px）。測れていなければ null */
  readonly unit: number | null;
  /** 枠が全幅のものだけなら、枠の格子を引き継いでラベルを揃える */
  readonly aligned: boolean;
  readonly onNeedOptions: (row: NodeRow) => void;
  readonly onResize: (nodeId: NodeId, widgetName: string, span: number) => void;
  readonly onResizeHeight: (nodeId: NodeId, widgetName: string, height: number) => void;
  /** LLM の引数にしていれば引数名。していなければ null */
  readonly argument: string | null;
  /** 加わったばかりで滑り込む・外すので抜ける */
  readonly motion?: MotionKind | undefined;
  readonly onMotionEnd?: ((key: string) => void) | undefined;
}

/**
 * 項目の外側。掴む受け口だけを持つ。
 * 掴んでいる項目は dnd-kit がポインタの動くたびに描き直すので、入力欄を持つ中身
 * （`AppFieldBody`）は分けて、受け取り物が同じなら描き直さない
 */
export function AppField({
  nodeId,
  group,
  row,
  span,
  height,
  unit,
  aligned,
  onNeedOptions,
  onResize,
  onResizeHeight,
  argument,
  motion = 'none',
  onMotionEnd,
}: AppFieldProps): React.ReactElement {
  const sortable = useSortable({
    id: appInputDragId({ nodeId, widgetName: row.widgetName }),
    data: {
      appDrag: { index: group.index, label: group.label, row: row.label },
      label: row.label,
    },
    attributes: sortableAttributes(),
    animateLayoutChanges: noLayoutAnimation,
  });
  // ずらし量は画面の px で来るので、列の倍率で割り戻す
  const zoom = useContext(ColumnZoomContext);

  return (
    <div
      ref={sortable.setNodeRef}
      // キーボードで開くメニューが、この項目の操作を集める範囲
      data-menu-row={row.label}
      className={appField({
        layout: fieldLayoutOf(row.multiline, aligned),
        aligned,
        dragging: sortable.isDragging,
        motion,
      })}
      // 中の部品の動きの終わりは拾わない
      onAnimationEnd={(event) => {
        if (motion !== 'none' && event.target === event.currentTarget) {
          onMotionEnd?.(appInputSpanKey(nodeId, row.widgetName));
        }
      }}
      style={{
        gridColumn: aligned ? undefined : `span ${String(span)}`,
        transform: CSS.Transform.toString(zoomedTransform(sortable.transform, zoom)),
        transition: sortable.transition,
      }}
    >
      <AppFieldBody
        nodeId={nodeId}
        row={row}
        span={span}
        height={height}
        unit={unit}
        onNeedOptions={onNeedOptions}
        onResize={onResize}
        onResizeHeight={onResizeHeight}
        argument={argument}
        attributes={sortable.attributes}
        listeners={sortable.listeners}
      />
    </div>
  );
}

/** 項目 1 つの枠 */
const appField = cva('relative min-w-0 text-xs', {
  variants: {
    // 揃える枠では枠の格子をそのまま使う。そうでなければ自前の格子を持つ
    // （複数行のものだけラベルを上に置く。カードと同じ判定）
    layout: { multiline: 'block', subgrid: 'grid grid-cols-subgrid items-start', own: ROW_GRID },
    aligned: { true: 'col-span-4', false: '' },
    // 掴んでいる間は落とす先に薄く置く（付いてくるのは見出し付きの枠）
    dragging: { true: 'opacity-30', false: '' },
    // 既存の枠に加わったら滑り込み、外すときは抜ける（チップと同じ短い動き）
    motion: CHIP_MOTION,
  },
});

/** 項目の並べ方（`appField` の `layout`） */
function fieldLayoutOf(multiline: boolean, aligned: boolean): 'multiline' | 'subgrid' | 'own' {
  if (multiline) return 'multiline';
  return aligned ? 'subgrid' : 'own';
}
