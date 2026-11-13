import { DragOverlay } from '@dnd-kit/core';

import {
  ConnectorOverlay,
  type ConnectorOverlayProps,
} from '@/components/comfy/flow/ConnectorOverlay';
import { DragChip } from '@/components/comfy/flow/DragChip';
import { DragGhost } from '@/components/comfy/flow/DragGhost';
import { DragLine } from '@/components/comfy/flow/DragLine';
import type { FlowDnd } from '@/components/comfy/flow/use-flow-dnd';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { t } from '@/i18n';

// ─────────────────────────────
// 列に重ねる層（線・埋め込みの嵌め先・掴んでいる間の覆い・掴んでいるものの写し）と案内。描くだけ
// ─────────────────────────────

/** ワークフローを開いていないときの案内 */
export function OpenWorkflowHint(): React.ReactElement {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
      {t('flow.canvas.openWorkflow')}
    </div>
  );
}

/** 線は飾り。描けなければ線だけを消して、ほかは使えるようにする */
export function ConnectorLayer({
  resetKey,
  ...overlay
}: ConnectorOverlayProps & { readonly resetKey: unknown }): React.ReactElement {
  return (
    <ErrorBoundary label={t('flow.canvas.connectors')} resetKey={resetKey} fallback={() => null}>
      <ConnectorOverlay {...overlay} />
      <DragLine />
    </ErrorBoundary>
  );
}

/**
 * 埋め込みのダイアログの嵌め先。アプリ入力の列より右の、
 * **見えている範囲だけ**を覆う（列の幅は設定から引く）。中身の幅いっぱいに
 * 広げると、横に送った先が画面の外へ出て欠ける。空のときは操作を素通しする。
 * 上端は列の中身の上端に揃える
 */
export function EmbedHost({
  attachHost,
  style,
}: {
  readonly attachHost: (element: HTMLElement | null) => void;
  readonly style: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      ref={attachHost}
      data-flow-overlay
      className="pointer-events-none absolute top-0 bottom-0 z-20"
      style={style}
    />
  );
}

/**
 * 掴んでいる間は、列の中身と線のホバーを止める覆い。
 * 中身の pointer-events を切り替えると、付け外しのたびに中の要素すべての見た目を
 * 計算し直す（約 4000 要素で 9ms）。覆いなら 1 要素で済む。
 * 覆いの上のホイールは、列の並びの枠の `onWheel` が列へ回す
 */
export function DragCover(): React.ReactElement {
  return (
    <div
      data-drag-cover
      aria-hidden
      className="absolute inset-0 z-30 hidden in-data-dragging:block"
    />
  );
}

/**
 * つかんでいるものをカーソルに付けて出す。出力・変数は型の札が付いてくる（アプリ入力は列の
 * 受け口が自分で出す）。カード・グループは掴んだときの写しが付いてくる
 */
export function FlowDragOverlay({
  dragging,
  ghost,
  zoom,
}: {
  readonly dragging: FlowDnd['dragging'];
  readonly ghost: FlowDnd['ghost'];
  readonly zoom: number;
}): React.ReactElement {
  return <DragOverlay dropAnimation={null}>{renderDragged(dragging, ghost, zoom)}</DragOverlay>;
}

/** 掴んでいるものの写し。出力・変数なら型の札、カード・グループならその写し */
function renderDragged(
  dragging: FlowDnd['dragging'],
  ghost: FlowDnd['ghost'],
  zoom: number,
): React.ReactElement | null {
  if (dragging !== null) return <DragChip type={dragging.type} value={dragging.value} />;
  if (ghost !== null) return <DragGhost node={ghost} zoom={zoom} />;
  return null;
}
