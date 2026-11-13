import { cva } from 'class-variance-authority';
import { useCallback } from 'react';
import { createPortal } from 'react-dom';

import {
  DialogChromeContext,
  dialogOpening,
  type DialogChrome,
} from '@/components/ui/dialog-chrome';
import { DIALOG_ZOOM_CLASS } from '@/components/ui/dialog-header';
import { DialogResizeEdges } from '@/components/ui/dialog-resize-edges';
import { useDialogWindow } from '@/hooks/ui/use-dialog-window';
import { useDialogZoom } from '@/hooks/ui/use-dialog-zoom';
import type { DialogMode } from '@/lib/dialog-rect';
import { cn } from '@/lib/utils';
import { OWN_ZOOM_MARK } from '@/lib/zoom-input';

// ─────────────────────────────
// 焦点を閉じ込めないダイアログの枠。開いている間も隣の列を触れる。埋め込みと自由移動で出し、
// 見出しの帯は中身の側が `DialogHeader` で置く。
// ─────────────────────────────

const windowFrame = cva(
  'bg-popover text-popover-foreground flex flex-col overflow-hidden rounded-lg border shadow-lg',
  {
    variants: {
      place: {
        embedded: 'pointer-events-auto absolute inset-0',
        /** まだ動かしていない自由移動。画面の中ほどに大きめに出す */
        centered: 'fixed top-1/2 left-1/2 h-[80vh] w-[80vw] -translate-x-1/2 -translate-y-1/2',
        placed: 'fixed',
      },
    },
  },
);

/** 焦点を閉じ込めない枠の props */
export interface DialogWindowProps {
  /** 出し方と枠を端末に残す名前。ダイアログごとに 1 つ */
  readonly id: string;
  /** 読み上げの名前（ダイアログの題名） */
  readonly label: string;
  /** 使う人が切り替えていないときの出し方。既定は自由移動 */
  readonly defaultMode?: DialogMode | undefined;
  /** 枠に付ける目印（`data-*`。差し込みの出どころの印など） */
  readonly marks?: Readonly<Record<`data-${string}`, string>> | undefined;
  /** 自由移動を持つか（既定は持つ）。持たなければ帯に出し方の切り替えを出さない */
  readonly floatable?: boolean | undefined;
  /** 閉じる手続き。ほかの埋め込みが開いたときに呼ぶ（× と同じもの） */
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}

/**
 * 焦点を閉じ込めない枠。自由移動では押したものが前に出る（焦点を閉じ込めるダイアログよりは下）
 */
export function DialogWindow({
  id,
  label,
  defaultMode = 'floating',
  marks,
  floatable = true,
  onClose,
  children,
}: DialogWindowProps): React.ReactElement | null {
  const { mode, host, visible, zIndex, placement, toggle, raise } = useDialogWindow({
    id,
    defaultMode,
    open: true,
    floatable,
    onClose,
  });
  const floating = mode === 'floating';
  const { popupRef, placed, style, move, resize } = placement;
  // 中身の倍率。開いている間だけ持つ
  const { attachZoom, zoom } = useDialogZoom();
  // ref のコールバックなので手で固定する（作り直すと付け外しが起き、倍率の見張りを張り直す）
  const attachFrame = useCallback(
    (element: HTMLDivElement | null) => {
      popupRef(element);
      attachZoom(element);
    },
    [popupRef, attachZoom],
  );

  const chrome: DialogChrome = {
    mode,
    onToggleMode: floatable ? toggle : null,
    move: floating ? move : null,
    visible,
  };

  const frame = (
    <div
      {...marks}
      {...{ [OWN_ZOOM_MARK]: '' }}
      ref={attachFrame}
      // 焦点を閉じ込めない枠なので、読み上げの役割は `dialog` にせず、題名を名前にした `region` に
      // する（WCAG 4.1.2。ランドマークとして辿れる）
      role="region"
      aria-label={label}
      hidden={!visible}
      data-dialog-window={id}
      className={cn(
        windowFrame({ place: windowPlaceOf(floating, placed) }),
        dialogOpening({ mode }),
      )}
      style={floating ? { ...style, zIndex } : undefined}
      // 押したものを前に出す（中身の操作はそのまま通す）
      onPointerDownCapture={raise}
    >
      <DialogChromeContext.Provider value={chrome}>
        {floating ? <DialogResizeEdges handlers={resize} /> : null}
        {/* 帯と本体に倍率を掛ける（四辺の掴む所は掛けない） */}
        <div className={DIALOG_ZOOM_CLASS} style={{ zoom }}>
          {children}
        </div>
      </DialogChromeContext.Provider>
    </div>
  );

  // 埋め込みの嵌め先が無いときは、自由移動として文書の末尾に出す（`useDialogWindow`）
  return createPortal(frame, floating || host === null ? document.body : host);
}

/** 枠の置き方。浮かせていなければ嵌め込み、浮かせて動かしたならその位置、ほかは中央 */
function windowPlaceOf(floating: boolean, placed: boolean): 'embedded' | 'placed' | 'centered' {
  if (!floating) return 'embedded';
  return placed ? 'placed' : 'centered';
}
