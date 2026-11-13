import { X } from 'lucide-react';

import { widgetControl, type WidgetAppearance } from '@/components/comfy/flow/widget-style';
import { DialogTrigger } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';

// ─────────────────────────────
// パラメータ行からモデルを選ぶダイアログを開く、入力欄の形の引き金。ダイアログの `trigger` に渡す
// （パラメータ行だけの見た目なので、ダイアログ本体には持たせない）。
// ─────────────────────────────

/** モデルの選択の引き金の受け取り物 */
export interface ModelPickerFieldProps {
  /** パラメータ名（読み上げ） */
  readonly label: string;
  /** 種別の呼び名（読み上げ。「Lora」「モデル」） */
  readonly kind: string;
  /** 箱に出す文字 */
  readonly text: string;
  /** 未入力でカード側の値を薄く出しているか */
  readonly muted: boolean;
  /** 見た目。呼び出し元の入力欄と揃える */
  readonly appearance: WidgetAppearance;
  /** 値を空にする。値が無ければ undefined（× を出さない） */
  readonly onClear?: (() => void) | undefined;
  /** 空にする操作の名前 */
  readonly clearLabel: string;
}

/** 値を入力欄の形で出し、押すとダイアログを開く。値があれば右端に空にする × を出す */
export function ModelPickerField({
  label,
  kind,
  text,
  muted,
  appearance,
  onClear,
  clearLabel,
}: ModelPickerFieldProps): React.ReactElement {
  const clearable = onClear !== undefined;

  return (
    <span className="relative flex w-full min-w-0">
      <DialogTrigger
        className={widgetControl({ appearance, muted, clearable }, 'truncate text-left')}
        aria-label={t('modelPicker.field.open', { label, kind })}
        title={text}
      >
        {text}
      </DialogTrigger>
      {clearable ? (
        <button
          type="button"
          className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2
            right-1 -translate-y-1/2 rounded p-0.5"
          // Tab で止めず、キーボードで開くメニューから届く
          {...MENU_ACTION}
          aria-label={t('modelPicker.field.clear', { label, action: clearLabel })}
          title={clearLabel}
          onClick={onClear}
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
