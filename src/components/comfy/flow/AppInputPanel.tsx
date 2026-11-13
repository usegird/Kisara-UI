import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useContext, useState } from 'react';
import { createPortal } from 'react-dom';

import { AnchorContext } from '@/components/comfy/flow/anchor-context';
import { AppDragPreview } from '@/components/comfy/flow/AppDragPreview';
import { AppInputColumn } from '@/components/comfy/flow/AppInputGroups';
import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from '@/components/ui/drag-activation';
import { dragAccessibility } from '@/components/ui/drag-announcements';
import { RenderProbe } from '@/components/ui/render-probe';
import { parseAppInputDragId, type AppInputGroup } from '@/graph/app-input-order';
import type { NodeRow } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { useFrozenRects } from '@/hooks/flow/use-frozen-rects';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// 並べ替え。掴んだ項目は見出し付きの枠として付いてきて（`AppDragPreview`）、元の項目は落とす先へ
// 実際に置き直して薄く見せる。並びのずらし（dnd-kit の strategy）では、別の枠の後ろへ回る動きを
// 見せられないので使わない。
// ─────────────────────────────

/** アプリ入力の列の受け取り物 */
export interface AppInputPanelProps {
  readonly groups: readonly AppInputGroup[];
  /** 項目ごとの幅（12 分割）。載っていないものは全幅 */
  readonly spans: ReadonlyMap<string, number>;
  /** 項目ごとの複数行の高さ（px）。載っていないものは既定の高さ */
  readonly heights: ReadonlyMap<string, number>;
  readonly onNeedOptions: (row: NodeRow) => void;
  readonly onResize: (nodeId: NodeId, widgetName: string, span: number) => void;
  /** 枠の右上の ×。その枠の項目をまとめてアプリ入力から外す */
  readonly onRemoveGroup: (group: AppInputGroup) => void;
  /** 枠の見出しでコメント（`title`）を書き換える */
  readonly onCommentChange: (nodeId: NodeId, comment: string) => void;
  /** 入力欄の下の枠線の掴み。その項目の高さを書く（カードとは共用しない） */
  readonly onResizeHeight: (nodeId: NodeId, widgetName: string, height: number) => void;
  /** 滑り込ませる枠と抜けさせる枠（`AppInputGroup.key`）。無ければ null */
  readonly enteringKey?: string | null | undefined;
  readonly leavingKey?: string | null | undefined;
  /** 枠の動きが終わった */
  readonly onMotionEnd?: ((key: string) => void) | undefined;
  /** 滑り込ませる項目と抜けさせる項目（`appInputSpanKey` の形）。無ければ null */
  readonly enteringField?: string | null | undefined;
  readonly leavingField?: string | null | undefined;
  /** 項目の動きが終わった */
  readonly onFieldMotionEnd?: ((key: string) => void) | undefined;
}

// ─────────────────────────────
// 並べ替えの受け口。アプリ入力の並べ替えはこの列の中だけで完結するので、カード・変数と共有する
// FlowCanvas の受け口から分ける（共有すると、重ねた先が変わるたびにカードと変数の部品まで描き直す）。
// ─────────────────────────────

const noop = (): void => {};

function AppInputPanelContent(props: AppInputPanelProps): React.ReactElement {
  const moveAppInput = useGraphStore((state) => state.moveAppInput);
  // 掴んでいる間に列が送られたら、線の位置を測り直す
  const anchors = useContext(AnchorContext);
  const { collisionDetection, keyboardOptions, release } = useFrozenRects();
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_ACTIVATION),
    useSensor(TouchSensor, TOUCH_ACTIVATION),
    useSensor(KeyboardSensor, keyboardOptions),
  );
  const [dragging, setDragging] = useState(false);
  const finish = (): void => {
    setDragging(false);
    release();
  };

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    finish();
    if (!over || active.id === over.id) return;
    const from = parseAppInputDragId(active.id);
    const to = parseAppInputDragId(over.id);
    if (from && to) moveAppInput(from, to);
  };

  // 項目が無ければ並べ替えも無いので、受け口を置かない
  if (props.groups.length === 0) {
    return <p className="text-muted-foreground px-1 py-2 text-xs">{t('flow.appInput.empty')}</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={dragAccessibility()}
      onDragStart={() => {
        release();
        setDragging(true);
      }}
      onDragMove={anchors?.remeasure ?? noop}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      {/* 掴んでいる間は、列の中身のホバーを止める（変数とカードを結ぶ線を掴むときと同じ）。
          中の要素すべてに当てず、子へ受け継がせる（付け外しで全部の見た目を計算し直さない） */}
      <div data-dragging={dragging ? '' : undefined} className="data-dragging:pointer-events-none">
        <AppInputColumn {...props} />
      </div>
      {/* 付いてくる枠は列の倍率の外に出す（倍率の中だと位置がずれる） */}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          <AppDragPreview />
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/**
 * アプリ入力の列を描く。計測の範囲は内側に置く
 * （外側に置くと、画面が描き直すたびに範囲だけが数えられる）
 */
export function AppInputPanel(props: AppInputPanelProps): React.ReactElement | null {
  return (
    <RenderProbe id="AppInputPanel">
      <AppInputPanelContent {...props} />
    </RenderProbe>
  );
}
