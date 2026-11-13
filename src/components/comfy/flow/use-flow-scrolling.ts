import type { AlignColumn } from '@/components/comfy/flow/connector-geometry';
import { useColumnMoves } from '@/components/comfy/flow/use-column-moves';
import { useFlowZoom } from '@/components/comfy/flow/use-flow-zoom';
import type { NodeId } from '@/graph/types';
import { useFlowColumnRefs } from '@/hooks/flow/use-flow-column-refs';
import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import type { DragHandlers } from '@/hooks/ui/use-drag-from';
import { useDragPan } from '@/hooks/ui/use-drag-pan';
import { zoomFactor, type ZoomColumn } from '@/store/settings-fields/column-zoom';

// ─────────────────────────────
// フロー画面の送りと列の倍率。FlowCanvas から切り出した状態と手続きで、使うのはそこだけ。
// ─────────────────────────────

/**
 * 掴んでも全体を送らない中身。カード・メモ（`li`）、アプリ入力の枠（`section`）、
 * 変数のまとまり（`data-flow-item`）、入力と操作、接続線（`svg` の中の当たり判定）、境目、重ねた画面
 */
const PAN_BLOCK = [
  'li',
  'section',
  '[data-flow-item]',
  'button',
  'input',
  'textarea',
  'select',
  'a',
  'label',
  '[contenteditable="true"]',
  'svg',
  '[role="separator"]',
  '[data-flow-overlay]',
].join(',');

/** 何も無い所か（掴んで全体を送ってよい所か） */
const isPanSurface = (target: Element): boolean => target.closest(PAN_BLOCK) === null;

/** フロー画面の列に付ける受け口と、送り・揃え・倍率の手続き */
interface FlowScrolling {
  /** 全体を横に送る枠に付ける */
  readonly attachFlowScroll: (element: HTMLDivElement | null) => void;
  /** アプリ入力の列に付ける */
  readonly attachAppScroll: (element: HTMLDivElement | null) => void;
  /** カードの列に付ける */
  readonly attachCardScroll: (element: HTMLDivElement | null) => void;
  /** 変数の列に付ける */
  readonly attachVariableScroll: (element: HTMLDivElement | null) => void;
  /** 列を並べた枠に付ける。測定の原点・掴んでいる印・倍率の受け口を兼ねる */
  readonly attachRow: (element: HTMLDivElement | null) => void;
  /** 変数の列の連動を止める手続きを受け取る（線を押して揃えている間に使う） */
  readonly holdVariables: (hold: () => () => void) => void;
  /** 掴んだまま端へ寄せたときに送る候補の列 */
  readonly scrollColumns: () => (HTMLDivElement | null)[];
  /** アプリ入力・変数とカードを結ぶ線を押したら、線が水平になるよう両方の列を送る */
  readonly align: (column: AlignColumn, other: number, card: number, at: number) => void;
  /**
   * カードの上端が列の上端に来るよう、カードの列を送る。出ていなければ何もしない
   */
  readonly revealCard: (id: NodeId) => void;
  /**
   * グループの枠の上端（タブ）が列の上端に来るよう、カードの列を送る。枠が無ければ何もしない
   */
  readonly revealGroup: (key: string) => void;
  /** 列の外で回したホイールを列へ回す */
  readonly forwardWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  /** 何も無い所を掴んで動かすと全体を送る */
  readonly pan: DragHandlers;
  /** 列ごとの倍率（1 が等倍） */
  readonly zoom: Readonly<Record<ZoomColumn, number>>;
  /** 倍率を 1 刻み動かす（狭い画面の右下のボタン。3 列まとめて） */
  readonly zoomBy: (column: ZoomColumn, direction: number) => void;
}

/**
 * フロー画面の列の送り・揃え・倍率の状態と手続きを持つ。列はそれぞれ独立して縦に送り、横だけは
 * 並び全体を送る（列は互いを削らないので、入り切らない分は右へはみ出す）。
 * 入口は列と線へ渡すので作り直さない。
 * @param anchors - 測定の仕組み（原点は列を並べた枠）
 * @param draggingRoot - 掴んでいる印を付ける要素の受け口（同じ枠に付ける）
 */
export function useFlowScrolling(
  anchors: AnchorRegistry,
  draggingRoot: (element: HTMLElement | null) => void,
): FlowScrolling {
  // 分けて受ける（`ref` に渡す入口を持つ物をまとめて読むと、lint が全部を ref と誤検知する）
  const {
    attachFlowScroll,
    attachAppScroll,
    attachCardScroll,
    attachVariableScroll,
    holdVariables,
    startHold,
    columnsNow,
    scrollColumns,
  } = useFlowColumnRefs();
  const { align, revealCard, revealGroup, outsideColumn, forwardWheel } = useColumnMoves(anchors, {
    columnsNow,
    startHold,
  });
  const { attachRow, zooms, zoomBy } = useFlowZoom(anchors, draggingRoot, columnsNow);

  // 何も無い所を掴んで動かすと全体を送る。横は全体、縦は掴んだ列だけ。
  // 列の外で掴んだらホイールと同じ列。変数の列を送ると連動は外れる（手で動かした扱い）
  const pan = useDragPan(
    () => columnsNow().flow,
    (target, event) => {
      if (target.closest('[data-app-scroll]')) return columnsNow().app;
      if (target.closest('[data-flow-scroll]')) return columnsNow().cards;
      if (target.closest('[data-variable-panel]')) return columnsNow().variables;
      return outsideColumn(event.clientX, event.clientY);
    },
    isPanSurface,
  );

  return {
    attachFlowScroll,
    attachAppScroll,
    attachCardScroll,
    attachVariableScroll,
    attachRow,
    holdVariables,
    scrollColumns,
    align,
    revealCard,
    revealGroup,
    forwardWheel,
    pan,
    zoom: {
      app: zoomFactor(zooms.app),
      cards: zoomFactor(zooms.cards),
      variables: zoomFactor(zooms.variables),
    },
    zoomBy,
  };
}
