import { cva } from 'class-variance-authority';
import { ExternalLink, PanelsTopLeft, X } from 'lucide-react';
import { useContext } from 'react';

import { DialogChromeContext } from '@/components/ui/dialog-chrome';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// ダイアログの見出しの帯。**どのダイアログもこれ 1 本**を使う。出し方の切り替えと掴みは、
// 囲んでいる枠から `DialogChromeContext` で受け取る（枠の外で使えばどちらも出ない）。
// ─────────────────────────────

/**
 * 見出しの帯。確認ダイアログもこの見た目を使う。
 * 中身 24px ＋上下 4px ずつ（32px）。区切りの線 1px はその外に足す。下に余白は付けない
 */
export const DIALOG_HEADER_CLASS =
  'bg-muted mb-0 box-content flex h-6 shrink-0 items-center gap-2 border-b px-3 py-1';
/** 帯の見た目。枠が掴みを渡したときだけ掴める印を付ける */
const dialogHeader = cva(DIALOG_HEADER_CLASS, {
  variants: { movable: { true: 'cursor-move touch-none', false: '' } },
});

/**
 * 帯と本体をまとめて倍率を掛ける入れ物。枠の縦の並びをそのまま引き継ぐ
 */
export const DIALOG_ZOOM_CLASS = 'flex min-h-0 min-w-0 flex-1 flex-col';

/**
 * 見出しの帯の右寄せのアイコン（取り直し・閉じるなど）。枠は 22px（余白 3px と絵 16px）。
 * 絵は `size-4` にする。送りの矢印は余白を `p-1` に戻して 24px で使う
 */
export const DIALOG_ICON_CLASS =
  'text-muted-foreground hover:bg-muted hover:text-foreground rounded p-[3px] disabled:opacity-40';

/** 見出しの帯の入り切りのアイコン（`aria-pressed`）が入っているときの見た目。帯の色から浮かせる */
export const DIALOG_TOGGLE_ON_CLASS =
  'aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:ring-border ' +
  'aria-pressed:ring-1';

/**
 * 出し方の切り替え。押すと今と逆の出し方になる（アイコンは移る先を示す）。
 * 自由移動はポップアップのアイコン（ビューワーの別窓と同じ）
 */
function DialogModeSwitch(): React.ReactElement | null {
  const chrome = useContext(DialogChromeContext);
  if (chrome?.onToggleMode == null) return null;

  const toEmbedded = chrome.mode === 'floating';
  const label = toEmbedded ? t('ui.dialog.toDocked') : t('ui.dialog.toFloating');
  return (
    <button
      type="button"
      className={DIALOG_ICON_CLASS}
      aria-label={label}
      title={toEmbedded ? t('ui.dialog.toDockedTitle') : t('ui.dialog.toFloatingTitle')}
      onClick={chrome.onToggleMode}
    >
      {toEmbedded ? (
        <PanelsTopLeft className="size-4" aria-hidden />
      ) : (
        <ExternalLink className="size-4" aria-hidden />
      )}
    </button>
  );
}

/** 見出しの帯の props。左から送り・題名・補足・右寄せの操作・出し方の切り替え・閉じる × の順に並ぶ */
export interface DialogHeaderProps {
  /** 題名の左に置くもの（前後へ送るボタンなど） */
  readonly leading?: React.ReactNode | undefined;
  /** 題名の要素（見出し・読み上げの名前を付けた要素）。無ければ補足から始める */
  readonly heading?: React.ReactNode | undefined;
  /** 題名の右に小さく出す補足 */
  readonly subtitle?: React.ReactNode | undefined;
  /** 右寄せ、出し方の切り替えの左に置くもの */
  readonly actions?: React.ReactNode | undefined;
  /** 閉じる × の要素（`DialogCloseButton` か基盤の閉じる）。確認ダイアログでは置かない */
  readonly close?: React.ReactNode | undefined;
  readonly className?: string | undefined;
}

/** 見出しの帯。自由移動で動かせるときは、帯を掴む場所にする */
export function DialogHeader({
  leading,
  heading,
  subtitle,
  actions,
  close,
  className,
}: DialogHeaderProps): React.ReactElement {
  const chrome = useContext(DialogChromeContext);
  const move = chrome?.move ?? null;

  return (
    <div
      data-dialog-header
      {...move}
      className={cn(dialogHeader({ movable: move !== null }), className)}
    >
      {leading}
      {heading}
      {subtitle === undefined ? null : (
        <span className="text-muted-foreground min-w-0 truncate text-xs">{subtitle}</span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {actions}
        <DialogModeSwitch />
        {close}
      </div>
    </div>
  );
}

/** 閉じる × の props */
export interface DialogCloseButtonProps {
  readonly onClose: () => void;
  /** 読み上げの名前。既定は「閉じる」 */
  readonly label?: string | undefined;
  /** 指したときの説明。既定は読み上げの名前と同じ */
  readonly title?: string | undefined;
}

/** 閉じる ×（焦点を閉じ込めない枠で使う。閉じ込める枠は基盤の閉じるを使う） */
export function DialogCloseButton({
  onClose,
  label = t('common.close'),
  title = label,
}: DialogCloseButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={DIALOG_ICON_CLASS}
      aria-label={label}
      title={title}
      onClick={onClose}
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
