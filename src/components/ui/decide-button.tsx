import { ArrowDownToLine, ArrowLeftToLine, Check, X } from 'lucide-react';

import { DIALOG_ICON_CLASS } from '@/components/ui/dialog-header';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// ダイアログの操作の帯に置く決定のボタンと、その並びの右端の閉じる ×。
// 層をまたいで使うので基盤の置き場に置く。
// ─────────────────────────────

const DECIDE_BUTTON_CLASS = `bg-primary text-primary-foreground flex shrink-0 items-center gap-1
  rounded-md px-2 py-0.5 disabled:opacity-40`;

/** 決定のボタンの props */
export interface DecideButtonProps {
  /** 読み上げの名前（何を決定するか） */
  readonly label: string;
  /** 指したときの説明。押せないときは理由を渡す */
  readonly title: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  /** ボタンの文字。既定は「決定」 */
  readonly caption?: string | undefined;
  /**
   * `insert` は外の欄へ差し込む、`set` はパラメータへ書いて閉じる、`apply` は印を付けた操作を
   * まとめて行う（ストレージの管理の適用）
   */
  readonly icon?: 'insert' | 'set' | 'apply' | undefined;
}

const DECIDE_ICONS = { insert: ArrowLeftToLine, set: ArrowDownToLine, apply: Check } as const;

/** 決定のボタン。アイコンは行き先で変える */
export function DecideButton({
  label,
  title,
  disabled,
  onClick,
  caption = t('ui.decide.caption'),
  icon = 'insert',
}: DecideButtonProps): React.ReactElement {
  const Icon = DECIDE_ICONS[icon];

  return (
    <button
      type="button"
      className={DECIDE_BUTTON_CLASS}
      aria-label={label}
      title={title}
      disabled={disabled}
      // 押しても焦点を奪わない（差し込み先の欄のキャレットを外さない）
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon className="size-3" aria-hidden />
      <span>{caption}</span>
    </button>
  );
}

/** 決定の並びの右端に置く閉じる ×。見出しの帯の × と同じ働きで、大きさも揃える */
export function PaneCloseButton({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={cn(DIALOG_ICON_CLASS, 'ml-auto shrink-0')}
      aria-label={label}
      title={t('common.close')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
