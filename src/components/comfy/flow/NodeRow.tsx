import { useDroppable } from '@dnd-kit/core';
import { cva } from 'class-variance-authority';
import { memo, useCallback, useContext, useLayoutEffect, useRef, type RefObject } from 'react';

import { AnchorContext, inputAnchorKey } from '@/components/comfy/flow/anchor-context';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import { inputDropData, inputDropId } from '@/components/comfy/flow/link-dnd';
import { LinkDragContext } from '@/components/comfy/flow/link-drag-context';
import { LinkChip } from '@/components/comfy/flow/LinkChip';
import { AddBeforeButton, RowHeading } from '@/components/comfy/flow/RowHeading';
import { useChipMotion } from '@/components/comfy/flow/use-chip-motion';
import { WidgetControl } from '@/components/comfy/flow/WidgetControl';
import { RenderProbe } from '@/components/ui/render-probe';
import { DEFAULT_MULTILINE_HEIGHT } from '@/graph/multiline-height';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { formatDisplayValue } from '@/i18n/format';

// ─────────────────────────────
// インプット行／パラメータ行。同じ形で縦に積み、未接続なら widget、接続済みなら変数名のチップに差し替える。
// ─────────────────────────────

/** カードの 1 行の受け取り物 */
export interface NodeRowProps {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly onCommit?: ((row: NodeRowData, value: unknown) => void) | undefined;
  /** COMBO の選択肢が未取得のときに取りに行かせる */
  readonly onNeedOptions?: ((row: NodeRowData) => void) | undefined;
  /** チップの × でリンクを解除する */
  readonly onDisconnect?: ((linkId: number) => void) | undefined;
  /** 行の三角から、この入力（パラメータを含む）の手前にノードを足す */
  readonly onAddBefore?: ((id: number, row: NodeRowData) => void) | undefined;
  /** 右端のアイコンで App Mode（アプリ入力）の対象を切り替える */
  readonly onToggleAppInput?: ((id: number, widgetName: string) => void) | undefined;
}

/**
 * 行の枠。複数行の入力はラベルを上に置く。デモは余白を倍にする（左は見出しと同じだけ増やし、
 * 取っ手と行のアプリ入力の印の横位置を揃えたままにする）
 */
const rowBox = cva(
  `group/row data-[drop-over]:bg-accent data-[drop-over]:ring-ring relative flex min-h-7
    text-xs data-[drop-over]:ring-2 data-[drop-over]:ring-inset`,
  {
    variants: {
      stacked: { true: 'flex-col items-start gap-0.5', false: 'items-center' },
      roomy: { false: 'pr-3', true: 'pr-6' },
      // 狭い画面は左と、名前と入力の間を詰める
      compact: { true: 'pl-0.5', false: '' },
    },
    compoundVariants: [
      { compact: false, roomy: false, class: 'pl-1' },
      { compact: false, roomy: true, class: 'pl-2' },
      { stacked: false, compact: false, class: 'gap-3' },
      { stacked: false, compact: true, class: 'gap-1.5' },
      { stacked: false, roomy: false, class: 'py-0.5' },
      { stacked: true, roomy: false, class: 'py-1' },
      { stacked: false, roomy: true, class: 'py-1' },
      { stacked: true, roomy: true, class: 'py-2' },
    ],
  },
);

/** 行の値の欄 */
const rowValue = cva('min-w-0', {
  variants: { stacked: { true: 'w-full pl-[5px]', false: 'flex-1' } },
});

/**
 * 複数行の本文は横並びだと幅が足りないので、ラベルの下に置いて行いっぱいに広げる。
 * アプリ入力にしたものはカードでは 1 行に縮める（編集の入口は左の列）
 */
function isStacked(row: NodeRowData): boolean {
  return row.multiline && row.kind !== 'link' && !row.appInput;
}

/**
 * カードの 1 行を描く。ここは行の要素と、落とし先の受け口の出し入れだけを持つ。
 * 入力欄を持つ中身（`NodeRowBody`）は分けて、受け取り物が同じなら描き直さない
 */
export function NodeRow(props: NodeRowProps): React.ReactElement {
  const { nodeId, row } = props;
  const anchors = useContext(AnchorContext);
  const { roomy, compact } = useContext(FlowLookContext);
  const linkDragging = useContext(LinkDragContext);
  const element = useRef<HTMLDivElement | null>(null);
  const anchor = row.kind === 'link' ? anchors?.register(inputAnchorKey(nodeId, row.name)) : null;
  // 作り直さない。作り直すと描くたびに付け直しで一度外れ、その間に落とし先が要素を受け取れない。
  // 正しさに要るので compiler に任せず手で固定する
  const attachRow = useCallback(
    (next: HTMLDivElement | null) => {
      anchor?.(next);
      element.current = next;
    },
    [anchor],
  );

  return (
    <div
      // 接続済みの行だけが接続線の端点になる
      ref={attachRow}
      // キーボードで開くメニューが、この行の操作を集める範囲
      data-menu-row={row.label}
      // 縦を詰める。文字の大きさはアプリ入力の列と揃える
      className={rowBox({ stacked: isStacked(row), roomy, compact })}
    >
      {linkDragging && row.linkable ? (
        // 置いた回数を数える（カードの並べ替えでは 0 のまま）
        <RenderProbe id="RowDropTarget">
          <RowDropTarget nodeId={nodeId} row={row} element={element} />
        </RenderProbe>
      ) : null}
      <NodeRowBody {...props} />
    </div>
  );
}

/**
 * 出力チップ・変数の落とし先。出力を掴んでいる間だけ置く（dnd-kit は掴む・重ねるたびに受け口を
 * 全部描き直すので、カードの並べ替えの間は置かない）。何も描かず、行の要素を受け口に渡し、
 * 重ねている間の印を行の要素へ直接付け外しする。三角を出す行と揃える
 * （パラメータ行は名前で指し、落とされたら入力に変えてから繋ぐ）
 */
function RowDropTarget({
  nodeId,
  row,
  element,
}: {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly element: RefObject<HTMLDivElement | null>;
}): null {
  const widgetDrop = row.kind === 'widget' ? { name: row.widgetName, type: row.type } : null;
  const { setNodeRef, isOver } = useDroppable({
    id: inputDropId(nodeId, row.inputSlot ?? -1, widgetDrop?.name ?? null),
    data: { ...inputDropData(nodeId, row.inputSlot ?? -1, widgetDrop), label: row.label },
  });
  useLayoutEffect(() => {
    setNodeRef(element.current);
  }, [element, setNodeRef]);
  useLayoutEffect(() => {
    const target = element.current;
    target?.toggleAttribute('data-drop-over', isOver);
    return () => target?.removeAttribute('data-drop-over');
  }, [element, isOver]);
  return null;
}

/**
 * 行の中身。全行で 1 つの名前に数える。計測の範囲は比べる部品の内側に置く。
 * 外側の行は受け取り物をまとめて渡すので、compiler では揃わない（手で memo する）
 */
const NodeRowBody = memo(function NodeRowBody(props: NodeRowProps): React.ReactElement {
  return (
    <RenderProbe id="NodeRow">
      <NodeRowContent {...props} />
    </RenderProbe>
  );
});

/** 行の中身。三角・見出し・値の欄（チップ・widget・注記）を並べる */
function NodeRowContent(props: NodeRowProps): React.ReactElement {
  const { nodeId, row, onDisconnect, onAddBefore, onToggleAppInput } = props;
  const chip = useChipMotion(row, onDisconnect);
  const stacked = isStacked(row);

  return (
    <>
      {onAddBefore && row.linkable ? (
        <AddBeforeButton nodeId={nodeId} row={row} onAddBefore={onAddBefore} />
      ) : null}

      <RowHeading nodeId={nodeId} row={row} stacked={stacked} onToggleAppInput={onToggleAppInput} />

      {/* 複数行の欄は、行の左の余白（4px）より 5px 内へ寄せる */}
      <div className={rowValue({ stacked })}>
        {row.kind === 'link' && row.source ? (
          <LinkChip
            row={row}
            source={row.source}
            motion={chip.motion}
            onMotionEnd={chip.end}
            onDisconnect={onDisconnect ? chip.start : undefined}
          />
        ) : null}
        {row.kind === 'widget' ? <RowWidget {...props} stacked={stacked} /> : null}
        <RowNote row={row} />
      </div>
    </>
  );
}

// ─────────────────────────────
// 行の中身の部分。どれも `NodeRowBody` の memo の内側で描く（memo の境界は増やさない）
// ─────────────────────────────

/**
 * 未接続のパラメータの入力欄。外部で値が変わったときの反映は部品の中で行う（欄を作り直さない）
 */
function RowWidget(props: NodeRowProps & { readonly stacked: boolean }): React.ReactElement {
  const { row, stacked, ...rest } = props;
  // 高さ（ノードの `size` の残りを等分したもの）を当てるのは、カードで編集できる複数行の入力だけ。
  // 変えるのはカードの下端の掴み
  const sized = row.multiline && !row.appInput;
  return (
    <div className="relative">
      <WidgetControl
        {...rest}
        // 1 行に縮めるものは複数行として扱わない（改行を詰めて省略して出す）
        row={stacked || !row.multiline ? row : { ...row, multiline: false }}
        readOnly={row.appInput}
        appearance="underline"
        height={sized ? (row.height ?? DEFAULT_MULTILINE_HEIGHT) : undefined}
      />
    </div>
  );
}

/** 値の欄に出す注記（未接続のソケット・名前を特定できないパラメータ） */
function RowNote({ row }: { readonly row: NodeRowData }): React.ReactElement | null {
  if (row.kind === 'socket') {
    return (
      <span className="text-muted-foreground text-xs">
        {t(row.required ? 'flow.row.unconnectedRequired' : 'flow.row.unconnected')}
      </span>
    );
  }
  if (row.kind !== 'unresolved') return null;
  if (row.value === undefined) {
    return <span className="text-muted-foreground text-xs">{t('flow.row.unknownName')}</span>;
  }
  return (
    <span
      className="border-input text-muted-foreground block truncate rounded-md border
        border-dashed px-2 py-0.5 text-xs"
      title={t('flow.row.unknownNameTitle')}
    >
      {formatDisplayValue(row.value)}
    </span>
  );
}
