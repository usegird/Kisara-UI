import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { stepFor, useZoomKeys, useZoomWheel } from '@/hooks/flow/use-column-zoom-input';
import {
  anchoredScrollTop,
  type ColumnZooms,
  type ZoomColumn,
} from '@/store/settings-fields/column-zoom';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 列の倍率の操作の受け口（ホイール・キー・ボタン）。どこの列かの判定は呼び出し側が持つ。
// ダイアログの上の操作は列に回さない（ダイアログが自分の倍率を変える。`use-dialog-zoom`）。
// ─────────────────────────────

/** 送り直しの基準。列の上端から指した位置まで（画面の px） */
interface ZoomAnchor {
  readonly scroller: HTMLElement;
  readonly offset: number;
}

/** 列の判定と送り直しの基準を、呼び出し側から受ける */
interface ColumnZoomOptions {
  /** 要素がどの列の中身か。列の中でなければ null */
  readonly columnOf: (target: Element) => ZoomColumn | null;
  /** 列の中身でない所（線を通す余白など）が、どの列に属するか。列を並べた枠の外なら null */
  readonly columnAt: (clientX: number, clientY: number) => ZoomColumn | null;
  /**
   * 送り直しの基準。`clientY` が null ならキーからの操作（列の真ん中を基準にする）。
   * 送り直さない列は null
   */
  readonly anchorOf: (column: ZoomColumn, clientY: number | null) => ZoomAnchor | null;
  /** 倍率が変わったあと（描き直した後）に呼ぶ。測り直しに使う */
  readonly onZoomed?: (() => void) | undefined;
  /** 3 列で 1 つの倍率を使う（狭い画面） */
  readonly unified: boolean;
}

/** 列ごとの倍率と、ボタンからの操作 */
interface ColumnZoom {
  /** 列ごとの倍率（百分率）。3 列で 1 つのときは同じ値が並ぶ */
  readonly zooms: ColumnZooms;
  /** ボタンからの操作。対象の列の真ん中を基準に送り直す */
  readonly zoomBy: (column: ZoomColumn, direction: number) => void;
}

interface Pending {
  readonly column: ZoomColumn;
  readonly from: number;
  readonly anchor: ZoomAnchor | null;
}

/**
 * 列の倍率（百分率）を返す。`host` は受け口を付ける先で、列を並べた枠（線を通す余白を含む）。
 * 要素は使う側が持つ（描いた後に現れるので、state で渡して付け直せるようにする）
 */
export function useColumnZoom(host: HTMLElement | null, options: ColumnZoomOptions): ColumnZoom {
  const columnZooms = useSettingsStore(useShallow((state) => state.columnZooms));
  const narrowZoom = useSettingsStore((state) => state.narrowZoom);
  const { unified } = options;
  // 送り直す layout effect の依存なので、compiler に任せず手で固定する
  const zooms = useMemo<ColumnZooms>(
    () => (unified ? { app: narrowZoom, cards: narrowZoom, variables: narrowZoom } : columnZooms),
    [unified, narrowZoom, columnZooms],
  );

  // 購読し直さずに最新の判定を使う
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const optionsNow = useCallback(() => latest.current, []);
  const zoomsRef = useRef(zooms);
  const pending = useRef<Pending | null>(null);

  // キーとホイールの受け口（effect）の依存。作り直すと付け直すので手で固定する
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

  // 倍率が変わったら、指していた所が同じ位置に残るよう、描き直した直後（描く前）に送り直す
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

  // 受け口の effect の順は、送り直す layout effect の後（ホイール → キー）
  useZoomWheel(host, { optionsNow, change });
  useZoomKeys(host, { optionsNow, change });

  const zoomBy = (column: ZoomColumn, direction: number): void =>
    change(column, null, () => stepFor(latest.current.unified, column, direction));

  return { zooms, zoomBy };
}
