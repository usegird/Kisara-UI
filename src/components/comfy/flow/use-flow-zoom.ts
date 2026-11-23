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

const ZOOM_COLUMN_MARKS: readonly (readonly [string, ZoomColumn])[] = [
  ['[data-app-scroll]', 'app'],
  ['[data-flow-scroll]', 'cards'],
  ['[data-variable-panel]', 'variables'],
];

function zoomColumnOf(target: Element): ZoomColumn | null {
  if (target.closest('[data-flow-overlay]')) return null;
  const hit = ZOOM_COLUMN_MARKS.find(([mark]) => target.closest(mark) !== null);
  return hit ? hit[1] : null;
}

export function useFlowZoom(
  anchors: AnchorRegistry,
  draggingRoot: (element: HTMLElement | null) => void,
  columnsNow: () => FlowColumnElements,
): {
  readonly attachRow: (element: HTMLDivElement | null) => void;
  readonly zooms: ColumnZooms;
  readonly zoomBy: (column: ZoomColumn, direction: number) => void;
} {
  const [zoomHost, setZoomHost] = useState<HTMLElement | null>(null);
  const attachContainer = anchors.attachContainer;
  const attachRow = useCallback(
    (element: HTMLDivElement | null) => {
      attachContainer(element);
      draggingRoot(element);
      setZoomHost(element);
    },
    [attachContainer, draggingRoot],
  );
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
