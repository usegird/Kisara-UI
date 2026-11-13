import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useState } from 'react';

import { useModalPlacement } from '@/components/ui/dialog';
import { dialogButton } from '@/components/ui/dialog-button';
import { DialogChromeContext, type DialogChrome } from '@/components/ui/dialog-chrome';
import { DialogHeader } from '@/components/ui/dialog-header';
import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';

// ─────────────────────────────
// 確認ダイアログ。取り返しのつかない操作と、並びを一度に崩す操作（処理順に並べる）の確認に使う。
// 焦点の閉じ込め・Escape・読み上げは Base UI に任せる。
// ─────────────────────────────

/** 確認ダイアログの props */
export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  /** 何を確かめるかの文。改行はそのまま出す */
  readonly description: string;
  /** 実行のボタンの文字 */
  readonly confirmLabel: string;
  /** やめるのボタンの文字。既定は「キャンセル」 */
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  /** やめる・Escape で閉じる */
  readonly onCancel: () => void;
  /** 説明の下に足すもの（選択肢など） */
  readonly children?: React.ReactNode;
}

interface Offset {
  readonly x: number;
  readonly y: number;
}

const CENTER: Offset = { x: 0, y: 0 };

/**
 * 帯を掴んで中央からずらす。開き直したら中央へ戻す（位置は残さない）。
 * ボタン・入力の上で押したときは掴まない
 */
function useConfirmOffset(open: boolean): {
  readonly offset: Offset;
  readonly move: DialogChrome['move'];
} {
  const [offset, setOffset] = useState(CENTER);
  const [wasOpen, setWasOpen] = useState(open);
  // 開いたときに中央へ戻す（描画中に前回の値と比べる）
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setOffset(CENTER);
  }

  const move = useDragFrom(
    (event: React.PointerEvent<HTMLElement>): Offset | null =>
      event.target instanceof Element && event.target.closest('button, input, select, label')
        ? null
        : offset,
    (from: Offset, dx: number, dy: number) => {
      setOffset({ x: from.x + dx, y: from.y + dy });
    },
  );
  return { offset, move };
}

/**
 * 確認ダイアログ。自由移動だけで出し、開くたびに中央へ戻す。
 * 閉じる × は置かない（やめる・実行のどちらかを選ばせる）
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = t('common.cancel'),
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps): React.ReactElement {
  const placement = useModalPlacement({
    id: 'confirm',
    defaultMode: 'floating',
    open,
    size: 'sm',
    // 動かすのはここで持つ（大きさは変えず、位置も残さない）
    movable: false,
    embeddable: false,
    // 確かめている間は、確かめている元の画面を閉じさせない
    onClose: null,
  });
  const { container, backdropClassName, popupClassName, popupRef } = placement;
  const { offset, move } = useConfirmOffset(open);
  const chrome: DialogChrome = { ...placement.chrome, move };

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialog.Portal container={container}>
        {/* 確かめるダイアログは外を押しても閉じない（どちらの出し方でも同じ） */}
        <AlertDialog.Backdrop className={backdropClassName} />
        <AlertDialog.Popup
          ref={popupRef}
          className={popupClassName}
          // 中央寄せ（`translate`）に重ねてずらす
          style={{ transform: `translate(${String(offset.x)}px, ${String(offset.y)}px)` }}
        >
          <DialogChromeContext.Provider value={chrome}>
            <DialogHeader
              heading={
                <AlertDialog.Title className="text-sm font-semibold">{title}</AlertDialog.Title>
              }
            />
            <div className="p-4">
              <AlertDialog.Description className="text-muted-foreground text-xs whitespace-pre-line">
                {description}
              </AlertDialog.Description>
              {children}

              <div className="mt-4 flex justify-end gap-2">
                <AlertDialog.Close className={dialogButton({ tone: 'secondary' })}>
                  {cancelLabel}
                </AlertDialog.Close>
                <button
                  type="button"
                  className={dialogButton({ tone: 'primary' })}
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </DialogChromeContext.Provider>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
