import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { cva } from 'class-variance-authority';
import { ArrowLeftToLine, ArrowUpRight, Bot, Brush, GripVertical } from 'lucide-react';
import { memo, useContext } from 'react';

import { AnchorContext, appSourceAnchorKey } from '@/components/comfy/flow/anchor-context';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import { HeightHandle } from '@/components/comfy/flow/HeightHandle';
import { SpanHandle } from '@/components/comfy/flow/SpanHandle';
import { WidgetControl } from '@/components/comfy/flow/WidgetControl';
import { RenderProbe } from '@/components/ui/render-probe';
import { promptNodeIdFor } from '@/graph/app-input-values';
import { DEFAULT_MULTILINE_HEIGHT } from '@/graph/multiline-height';
import type { NodeRow } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { formatEditValue } from '@/lib/text';
import { useAppValuesStore } from '@/store/use-app-values-store';
import { useStylesStore } from '@/store/use-styles-store';

// ─────────────────────────────
// アプリ入力の項目の中身（掴み・ラベル・入力・取り込み）
// ─────────────────────────────

interface AppFieldBodyProps {
  readonly nodeId: NodeId;
  readonly row: NodeRow;
  readonly span: number;
  readonly height: number | undefined;
  readonly unit: number | null;
  readonly onNeedOptions: (row: NodeRow) => void;
  /** パネルの手続きをそのまま受ける（束ねた手続きは描き直すたびに変わり、比べても意味がない） */
  readonly onResize: (nodeId: NodeId, widgetName: string, span: number) => void;
  readonly onResizeHeight: (nodeId: NodeId, widgetName: string, height: number) => void;
  /** LLM の引数にしていれば引数名。していなければ null */
  readonly argument: string | null;
  /** 掴みに付ける受け口（dnd-kit が覚えているものをそのまま渡す） */
  readonly attributes: DraggableAttributes;
  readonly listeners: DraggableSyntheticListeners;
}

/**
 * 項目の中身。計測の範囲は比べる部品の内側に置く。
 * 外側の `AppField` は compiler が飛ばす（描画中に ref を読むとみなされる）ので、手で memo する
 */
export const AppFieldBody = memo(function AppFieldBody(
  props: AppFieldBodyProps,
): React.ReactElement {
  return (
    <RenderProbe id="AppField">
      <AppFieldContent {...props} />
    </RenderProbe>
  );
});

/** 掴み / ラベル / 入力 / 取り込み（幅の掴みは入力の枠に重ねる） */
function AppFieldContent({
  nodeId,
  row,
  span,
  height = DEFAULT_MULTILINE_HEIGHT,
  unit,
  onNeedOptions,
  onResize,
  onResizeHeight,
  argument,
  attributes,
  listeners,
}: AppFieldBodyProps): React.ReactElement {
  // subgraph の昇格 widget は、実行時は内部ノードに入る
  const promptNodeId = promptNodeIdFor(nodeId, row);
  const value = useAppValuesStore((state) => state.values.get(promptNodeId)?.[row.widgetName]);
  const setValue = useAppValuesStore((state) => state.setValue);

  const cardValue = formatEditValue(row.value);
  const entered = value !== undefined;

  // カードと同じ判定。複数行のものだけラベルを上に置く
  const stacked = row.multiline;
  // 高さは項目ごとに持つ（本体と同じ `inputs` の 3 番目の要素）。カードとは共用しない
  const anchors = useContext(AnchorContext);
  const importable = useContext(FlowLookContext).appImport;
  // スタイルの表が読めているときだけ、複数行の文面をスタイルへ送れる
  const stylesReady = useStylesStore(
    (state) => state.status === 'ready' || state.status === 'saving',
  );
  const requestNewStyle = useStylesStore((state) => state.requestNewStyle);

  const grip = (
    <button
      type="button"
      className={appFieldGrip({ stacked })}
      aria-label={t('flow.shared.reorder', { name: row.label })}
      title={t('flow.appInput.dragToReorder')}
      {...attributes}
      {...listeners}
      // 基盤の付ける止まる所を打ち消し、メニューから届くようにする
      {...MENU_ACTION}
    >
      <GripVertical className="size-3.5" aria-hidden />
    </button>
  );

  // カード側の値の取り込み。常時出す（上書きは Ctrl+Z で戻せる）。
  // 入力から見て右のカードから左へ引く操作なので、左向きの矢印にする
  const importButton =
    !importable || cardValue.length === 0 ? null : (
      <button
        type="button"
        className="text-foreground/70 hover:text-foreground shrink-0 rounded p-0.5"
        {...MENU_ACTION}
        aria-label={t('flow.appInput.importLabel', { name: row.label })}
        title={t('flow.appInput.importTitle', { value: cardValue })}
        onClick={() => setValue(promptNodeId, row.widgetName, row.value)}
      >
        <ArrowLeftToLine className="size-3.5" aria-hidden />
      </button>
    );

  // 見えている文面（入れた値、無ければカードの値）を、肯定に入れた新規のスタイルとして開く
  const shownText = entered ? formatEditValue(value) : cardValue;
  const styleButton =
    !stacked || !stylesReady || shownText.length === 0 ? null : (
      <button
        type="button"
        className="text-foreground/70 hover:text-foreground shrink-0 rounded p-0.5"
        {...MENU_ACTION}
        aria-label={t('flow.appInput.toStyleLabel', { name: row.label })}
        title={t('flow.appInput.toStyleTitle')}
        onClick={() => requestNewStyle(shownText)}
      >
        {/* 筆の印の右下に、送り出す矢印を重ねる（スタイルへ送る） */}
        <span className="relative block size-3.5" aria-hidden>
          <Brush className="size-3" />
          <ArrowUpRight className="absolute -right-1 -bottom-0.5 size-2.5" strokeWidth={3} />
        </span>
      </button>
    );

  // LLM の引数にしている欄の印。指すと引数名を出す
  const argumentMark =
    argument === null ? null : (
      <Bot
        className="text-success size-3.5 shrink-0"
        role="img"
        aria-label={t('flow.appInput.argument', { name: argument })}
      >
        <title>{t('flow.appInput.argument', { name: argument })}</title>
      </Bot>
    );

  const control = (
    <WidgetControl
      // 値が外から変わったときの反映は部品の中で行う（欄を作り直さない）
      key={row.name}
      row={row}
      value={entered ? value : ''}
      placeholder={cardValue}
      onCommit={(_row, next) => setValue(promptNodeId, row.widgetName, next)}
      onNeedOptions={onNeedOptions}
      height={stacked ? height : undefined}
    />
  );

  // 幅の掴みは入力欄の右の枠線、高さの掴みは下の枠線に重ねる（角でまとめない）。
  // 真偽の入力は枠線を持たないので点線を出す
  // 入力欄は、元のカードの行へ引く線の始点の高さを決める（横は枠の右の枠線。線は ConnectorOverlay）
  const field = (
    <div
      ref={anchors?.register(appSourceAnchorKey(nodeId, row.widgetName))}
      className="relative min-w-0"
    >
      {control}
      <SpanHandle
        label={row.label}
        span={span}
        unit={unit}
        guide={row.type === 'BOOLEAN'}
        onChange={(next) => onResize(nodeId, row.widgetName, next)}
      />
      {stacked ? (
        <HeightHandle
          label={row.label}
          height={height}
          onChange={(next) => onResizeHeight(nodeId, row.widgetName, next)}
          menuAction
        />
      ) : null}
    </div>
  );

  return stacked ? (
    <>
      <div className="mb-0.5 flex items-center gap-1">
        {grip}
        <span className="text-foreground/80 min-w-0 truncate" title={row.label}>
          {row.label}
        </span>
        {argumentMark}
        {/* スタイルへ送るアイコンは取り込みの矢印から 4px 離す */}
        <span className="ml-auto flex shrink-0 gap-1">
          {styleButton}
          {importButton}
        </span>
      </div>
      {field}
    </>
  ) : (
    // 1 行。ラベルの右は詰め、取り込みアイコンの分だけ入力を短くする
    <>
      {grip}
      {/* ラベルと引数の印を 1 つの格子の枡に入れる（印が増えても格子の列は変えない） */}
      <span className="flex min-w-0 items-start gap-0.5 pt-[5px] pr-[5px]">
        <span className="text-foreground/80 min-w-0 truncate" title={row.label}>
          {row.label}
        </span>
        {argumentMark}
      </span>
      {field}
      {/* 取り込みを出さないなら、その場所も取らない */}
      {importable ? (
        <span className="mt-1 flex w-5 shrink-0 justify-end">{importButton}</span>
      ) : null}
    </>
  );
}

/** 掴みの取っ手 */
const appFieldGrip = cva(
  'text-muted-foreground hover:bg-muted -ml-1 shrink-0 cursor-grab rounded p-0.5',
  {
    variants: {
      // 上揃えの行で、入力欄の 1 行目と高さを合わせる（入力欄は枠 1px + 上下 4px）
      stacked: { true: '', false: 'mt-1' },
    },
  },
);
