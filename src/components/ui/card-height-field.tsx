import { useState } from 'react';

import { dialogControl } from '@/components/ui/dialog-control';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  CARD_HEIGHT_MAX,
  CARD_HEIGHT_MIN,
  CARD_HEIGHT_STEP,
  parseCardHeight,
} from '@/store/settings-fields/card-size';
import { useSettingsStore } from '@/store/use-settings-store';

const FIELD_CLASS = cn(dialogControl({ kind: 'field' }), 'h-7');

export function CardHeightField({ height }: { readonly height: number }): React.ReactElement {
  const setCardHeight = useSettingsStore((state) => state.setModelCardHeight);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="text-muted-foreground flex shrink-0 items-center gap-1">
      {t('modelPicker.cardHeight.label')}
      <input
        type="number"
        className={`${FIELD_CLASS} w-[46px] tabular-nums`}
        value={draft ?? String(height)}
        min={CARD_HEIGHT_MIN}
        max={CARD_HEIGHT_MAX}
        step={CARD_HEIGHT_STEP}
        aria-label={t('modelPicker.cardHeight.input')}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parseCardHeight(event.target.value);
          if (parsed !== null) setCardHeight(parsed);
        }}
        onBlur={() => setDraft(null)}
      />
      px
    </label>
  );
}
