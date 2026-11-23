import { X } from 'lucide-react';

import { widgetControl, type WidgetAppearance } from '@/components/comfy/flow/widget-style';
import { DialogTrigger } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';

export interface ModelPickerFieldProps {
  readonly label: string;
  readonly kind: string;
  readonly text: string;
  readonly muted: boolean;
  readonly appearance: WidgetAppearance;
  readonly onClear?: (() => void) | undefined;
  readonly clearLabel: string;
}

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
