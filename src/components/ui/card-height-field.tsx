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

// ─────────────────────────────
// カードの高さの欄。値は端末に残す 1 つで、モデルと画像の選択で共有する。
// ─────────────────────────────

/** 並び替え・昇降と高さを揃える（中身の大きさで枠の高さが変わらないように） */
const FIELD_CLASS = cn(dialogControl({ kind: 'field' }), 'h-7');

/** カードの高さを打ち込む欄。打鍵の途中は手元に持ち、整数で範囲に入ったときだけ設定へ書く */
export function CardHeightField({ height }: { readonly height: number }): React.ReactElement {
  const setCardHeight = useSettingsStore((state) => state.setModelCardHeight);
  // 打鍵の途中だけ手元に持つ。打っていないときは設定の値を出す
  // （選択肢ごとに画面があるので、手元に持ち続けると別の画面で変えた値が映らない）
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
          // 整数で範囲に入ったときだけ反映する（空・打鍵の途中は書かない）
          const parsed = parseCardHeight(event.target.value);
          if (parsed !== null) setCardHeight(parsed);
        }}
        onBlur={() => setDraft(null)}
      />
      px
    </label>
  );
}
