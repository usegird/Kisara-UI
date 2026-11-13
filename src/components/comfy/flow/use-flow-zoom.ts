import { useCallback, useState } from 'react';

import {
  APP_VIEWPORT_ANCHOR_KEY,
  PANEL_ANCHOR_KEY,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import { useColumnZoom } from '@/hooks/flow/use-column-zoom';
import type { FlowColumnElements } from '@/hooks/flow/use-flow-column-refs';
import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { useNarrowScreen } from '@/hooks/ui/use-narrow-screen';
import type { ColumnZooms, ZoomColumn } from '@/store/settings-fields/column-zoom';

// ─────────────────────────────
// フロー画面の列の倍率と、列を並べた枠の受け口（測定の原点・掴んでいる印・倍率の受け口を兼ねる）。
// ─────────────────────────────

/** 列の中身の目印と、その列 */
const ZOOM_COLUMN_MARKS: readonly (readonly [string, ZoomColumn])[] = [
  ['[data-app-scroll]', 'app'],
  ['[data-flow-scroll]', 'cards'],
  ['[data-variable-panel]', 'variables'],
];

/** 要素がどの列の中身か。重ねた画面（埋め込みのダイアログ）は列に含めない */
function zoomColumnOf(target: Element): ZoomColumn | null {
  if (target.closest('[data-flow-overlay]')) return null;
  const hit = ZOOM_COLUMN_MARKS.find(([mark]) => target.closest(mark) !== null);
  return hit ? hit[1] : null;
}

/**
 * 列を並べた枠の受け口と列の倍率を返す。
 * @param anchors - 測定の仕組み（原点は列を並べた枠）
 * @param draggingRoot - 掴んでいる印を付ける要素の受け口（同じ枠に付ける）
 * @param columnsNow - 今の列の要素を読む手続き
 */
export function useFlowZoom(
  anchors: AnchorRegistry,
  draggingRoot: (element: HTMLElement | null) => void,
  columnsNow: () => FlowColumnElements,
): {
  readonly attachRow: (element: HTMLDivElement | null) => void;
  readonly zooms: ColumnZooms;
  readonly zoomBy: (column: ZoomColumn, direction: number) => void;
} {
  // 列の倍率。線を通す余白は左の列に属する:
  //   カードより左 → アプリ入力 / 変数より左 → カード / それより右 → 変数
  const [zoomHost, setZoomHost] = useState<HTMLElement | null>(null);
  // 測定の原点と倍率の受け口は同じ枠。毎回新しい関数を渡すと付け外しが繰り返されるので固定する
  const attachContainer = anchors.attachContainer;
  const attachRow = useCallback(
    (element: HTMLDivElement | null) => {
      attachContainer(element);
      draggingRoot(element);
      setZoomHost(element);
    },
    [attachContainer, draggingRoot],
  );
  // 狭い画面では 3 列で 1 つの倍率。カードの列は面と一緒に送るので、面を送り直す
  const narrow = useNarrowScreen();
  const { zooms, zoomBy } = useColumnZoom(zoomHost, {
    unified: narrow,
    columnOf: zoomColumnOf,
    columnAt: (clientX, clientY) => {
      const at = anchors.localPoint(clientX, clientY);
      if (at === null) return null;
      const cards = anchors.positions.getState().rects.get(VIEWPORT_ANCHOR_KEY);
      if (cards !== undefined && at.x < cards.left) return 'app';
      const variables = anchors.positions.getState().rects.get(PANEL_ANCHOR_KEY);
      return variables !== undefined && at.x >= variables.left ? 'variables' : 'cards';
    },
    // 変数の列はカードに合わせて自分で送り直すので、ここでは送らない
    anchorOf: (column, clientY) => {
      const scroller = scrollerOfColumn(column, narrow, {
        flow: columnsNow().flow,
        app: columnsNow().app,
        cards: columnsNow().cards,
      });
      if (scroller === null) return null;
      const middle = scroller.clientHeight / 2;
      if (clientY === null) return { scroller, offset: middle };

      const key = column === 'app' && !narrow ? APP_VIEWPORT_ANCHOR_KEY : VIEWPORT_ANCHOR_KEY;
      const rect = anchors.positions.getState().rects.get(key);
      const at = anchors.localPoint(0, clientY);
      if (rect === undefined || at === null) return { scroller, offset: middle };
      return { scroller, offset: Math.min(scroller.clientHeight, Math.max(0, at.y - rect.top)) };
    },
    onZoomed: anchors.remeasure,
  });

  return { attachRow, zooms, zoomBy };
}

/** 指した列を送る要素。狭い画面ではフロー全体を 1 つで送る。変数の列は送らない（null） */
function scrollerOfColumn(
  column: string,
  narrow: boolean,
  scrollers: {
    readonly flow: HTMLElement | null;
    readonly app: HTMLElement | null;
    readonly cards: HTMLElement | null;
  },
): HTMLElement | null {
  if (narrow) return scrollers.flow;
  if (column === 'app') return scrollers.app;
  return column === 'cards' ? scrollers.cards : null;
}
