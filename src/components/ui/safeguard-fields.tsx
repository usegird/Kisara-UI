import { useId } from 'react';

import { SETTING_HEADING_CLASS } from '@/components/ui/appearance-fields';
import { field } from '@/components/ui/field';
import { t, type MessageKey } from '@/i18n';
import { formatNumber } from '@/i18n/format';
import { SAFEGUARD_KEYS, type Safeguards } from '@/store/settings-fields/safeguards';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 防御機構の欄。繰り返し実行と LLM の要求の量の上限を出すだけで、変えられない。
// ComfyUI の設定のタブと会話の設定のタブで同じものを使う
// ─────────────────────────────

/** 値の欄。数を右に揃える */
const VALUE = `${field({ size: 'xs' })} w-24 text-right tabular-nums`;

/** 項目ごとの名前の文言（単位を含む） */
const LABEL_KEYS = {
  repeatFailureLimit: 'settings.safeguards.repeatFailureLimit',
  repeatMinIntervalMs: 'settings.safeguards.repeatMinIntervalMs',
  repeatMaxRuns: 'settings.safeguards.repeatMaxRuns',
  llmRequestInputMax: 'settings.safeguards.llmRequestInputMax',
  llmWindowMinutes: 'settings.safeguards.llmWindowMinutes',
  llmWindowOutputLimit: 'settings.safeguards.llmWindowOutputLimit',
  llmWindowInputLimit: 'settings.safeguards.llmWindowInputLimit',
  llmSilentMinutes: 'settings.safeguards.llmSilentMinutes',
  toolAutoRunMax: 'settings.safeguards.toolAutoRunMax',
} as const satisfies Record<keyof Safeguards, MessageKey>;

/** 防御機構の見出し・説明と、開閉で畳んだ値の一覧（読み取り専用の欄） */
export function SafeguardFields(): React.ReactElement {
  const id = useId();
  const safeguards = useSettingsStore((state) => state.safeguards);
  return (
    <>
      <span className={SETTING_HEADING_CLASS}>{t('settings.safeguards.heading')}</span>
      <p className="text-muted-foreground px-1">{t('settings.safeguards.note')}</p>
      {/* 値の一覧は開閉で畳み、既定は閉じる */}
      <details className="text-muted-foreground px-1">
        <summary className="cursor-pointer select-none">{t('settings.safeguards.show')}</summary>
        <div className="mt-1 grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1">
          {SAFEGUARD_KEYS.map((key) => (
            <SafeguardRow key={key} id={`${id}-${key}`} label={t(LABEL_KEYS[key])}>
              {safeguards[key]}
            </SafeguardRow>
          ))}
        </div>
      </details>
    </>
  );
}

function SafeguardRow({
  id,
  label,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: number;
}): React.ReactElement {
  return (
    <>
      <label className="text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <input id={id} className={VALUE} value={formatNumber(children)} readOnly />
    </>
  );
}
