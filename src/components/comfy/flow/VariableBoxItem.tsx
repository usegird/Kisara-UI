import { useDraggable } from '@dnd-kit/core';
import { cva } from 'class-variance-authority';
import { memo, useContext } from 'react';

import { AnchorContext, variableAnchorKey } from '@/components/comfy/flow/anchor-context';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import { outputDragData, outputDragId } from '@/components/comfy/flow/link-dnd';
import { valueTooltip } from '@/components/comfy/flow/value-tooltip';
import { ValueText } from '@/components/comfy/flow/ValueText';
import { groupPadding } from '@/components/comfy/flow/variable-panel-values';
import { draggableAttributes } from '@/components/ui/drag-announcements';
import { joinValues } from '@/graph/output-values';
import type { NodeId } from '@/graph/types';
import { VARIABLE_PANEL_METRICS } from '@/graph/variable-panel-metrics';
import type { VariableBox } from '@/graph/variables';
import { t } from '@/i18n';
import { slotColor } from '@/styles/slot-color';

// ─────────────────────────────
// 変数ボックス 1 つ
// ─────────────────────────────

const { BOX_HEIGHT } = VARIABLE_PANEL_METRICS;

/** 変数ボックス 1 つ */
const variableBox = cva(
  [
    'border-border bg-card absolute inset-0 flex cursor-grab items-center gap-1.5 rounded',
    'border px-1.5 text-left text-2xs',
  ],
  {
    variants: {
      // 生成元がミュート＝この変数は作られない。薄くせず、取り消し線（番号とラベル）と破線の枠で見せる
      // （WCAG 1.4.3）
      muted: { true: 'border-dashed', false: '' },
      dragging: { true: 'opacity-50', false: '' },
    },
  },
);

/** 型が `*`（何でも通す出力）のときは型名にならないので、出力名で代用する */
function typeLabel(box: VariableBox): string {
  return box.type === '*' ? box.name : box.type;
}

/**
 * ボックスの中身（型の ●・名前・値）。掴んでいる間は描き直さない
 */
function BoxLabel({ box }: { readonly box: VariableBox }): React.ReactElement {
  return (
    <>
      {/* 型は ● で示す（パラメータ行と同じ見せ方） */}
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: slotColor(box.type) }}
      />
      <span className="shrink-0 font-medium">{box.name}</span>
      {/* 値は幅に合わせて CSS で省略する（データ側では切らない） */}
      {box.values.length > 0 ? (
        <ValueText values={box.values} className="text-muted-foreground min-w-0 truncate" />
      ) : null}
    </>
  );
}

/**
 * 変数ボックス。パラメータ行へドラッグすると接続できる。
 * dnd-kit は掴んだとき・重ねた先が変わったときに掴める部品を全部描き直すので、
 * ここは掴む受け口だけにして、中身は `BoxLabel` に分ける。
 * 列は位置が変わるたびに箱の並びを作り直す（compiler は並び全体でしか揃えない）ので、手で memo する
 */
export const Box = memo(function Box({
  box,
  top,
  index,
  onAddAfter,
}: {
  readonly box: VariableBox;
  readonly top: number;
  /** 生成元カードの通し番号。ホバー説明の先頭に出す */
  readonly index: string | null;
  /** 枠の左外の ◀。この変数を受け取るノードを足す */
  readonly onAddAfter?: ((id: NodeId, slot: number, type: string) => void) | undefined;
}): React.ReactElement {
  const anchors = useContext(AnchorContext);
  const pad = groupPadding(useContext(FlowLookContext).roomy);
  const draggable = useDraggable({
    id: outputDragId(box.nodeId, box.slot, 'panel'),
    data: {
      ...outputDragData(box.nodeId, box.slot, typeLabel(box), joinValues(box.values)),
      label: box.name,
    },
    attributes: draggableAttributes(),
  });
  const anchor = anchors?.register(variableAnchorKey(box.key));

  return (
    <div
      ref={anchor}
      className="group/box absolute"
      style={{ top, left: pad, right: pad, height: BOX_HEIGHT }}
    >
      <button
        type="button"
        ref={(element) => {
          draggable.setNodeRef(element);
        }}
        className={variableBox({ muted: box.muted, dragging: draggable.isDragging })}
        // ホバー説明は「通し番号 生成元 / 出力名」＋**値を1行ずつ**（省略しない）
        title={valueTooltip(index, `${box.sourceLabel} / ${box.name}`, box.values, box.muted)}
        {...draggable.attributes}
        {...draggable.listeners}
      >
        <BoxLabel box={box} />
      </button>

      {/* 枠の外、列の左に空けた場所に出す。**乗せるのはここだけ**（枠に乗せても出さない）。
          接続線より上に出す（線の終点と重なる位置にあるため） */}
      {onAddAfter ? (
        <button
          type="button"
          className="text-muted-foreground absolute top-1/2 z-10 flex -translate-y-1/2
            items-center justify-center opacity-0 transition-opacity hover:opacity-100
            focus:opacity-100"
          style={{ right: '100%', marginRight: 5, width: 10, height: 18 }}
          aria-label={t('flow.shared.addAfter', { name: box.name })}
          title={t('flow.variables.addAfterTitle')}
          onClick={() => onAddAfter(box.nodeId, box.slot, box.type)}
        >
          <span
            aria-hidden
            className="block h-0 w-0 border-y-[7px] border-r-[8px] border-y-transparent"
            style={{ borderRightColor: 'currentColor' }}
          />
        </button>
      ) : null}
    </div>
  );
});
