import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { stepFor, useZoomKeys, useZoomWheel } from '@/hooks/flow/use-column-zoom-input';
import {
  anchoredScrollTop,
  type ColumnZooms,
  type ZoomColumn,
} from '@/store/settings-fields/column-zoom';
import { useSettingsStore } from '@/store/use-settings-store';

interface ZoomAnchor {
  readonly scroller: HTMLElement;
  readonly offset: number;
}

interface ColumnZoomOptions {
  readonly columnOf: (target: Element) => ZoomColumn | null;
  readonly columnAt: (clientX: number, clientY: number) => ZoomColumn | null;
  readonly anchorOf: (column: ZoomColumn, clientY: number | null) => ZoomAnchor | null;
  readonly onZoomed?: (() => void) | undefined;
  readonly unified: boolean;
}

interface ColumnZoom {
  readonly zooms: ColumnZooms;
  readonly zoomBy: (column: ZoomColumn, direction: number) => void;
}

interface Pending {
  readonly column: ZoomColumn;
  readonly from: number;
  readonly anchor: ZoomAnchor | null;
}

export function useColumnZoom(host: HTMLElement | null, options: ColumnZoomOptions): ColumnZoom {
  const columnZooms = useSettingsStore(useShallow((state) => state.columnZooms));
  const narrowZoom = useSettingsStore((state) => state.narrowZoom);
  const { unified } = options;
  const zooms = useMemo<ColumnZooms>(
    () => (unified ? { app: narrowZoom, cards: narrowZoom, variables: narrowZoom } : columnZooms),
    [unified, narrowZoom, columnZooms],
  );

  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const optionsNow = useCallback(() => latest.current, []);
  const zoomsRef = useRef(zooms);
  const pending = useRef<Pending | null>(null);

  const change = useCallback(
    (column: ZoomColumn, clientY: number | null, apply: () => void): void => {
      pending.current = {
        column,
        from: zoomsRef.current[column],
        anchor: latest.current.anchorOf(column, clientY),
      };
      apply();
    },
    [],
  );

  useLayoutEffect(() => {
    zoomsRef.current = zooms;
    const current = pending.current;
    pending.current = null;
    if (current === null || current.from === zooms[current.column]) return;

    const { anchor } = current;
    if (anchor !== null) {
      anchor.scroller.scrollTop = anchoredScrollTop(
        anchor.scroller.scrollTop,
        anchor.offset,
        current.from,
        zooms[current.column],
      );
    }
    latest.current.onZoomed?.();
  }, [zooms]);

  useZoomWheel(host, { optionsNow, change });
  useZoomKeys(host, { optionsNow, change });

  const zoomBy = (column: ZoomColumn, direction: number): void =>
    change(column, null, () => stepFor(latest.current.unified, column, direction));

  return { zooms, zoomBy };
}
