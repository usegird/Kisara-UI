import { useId } from 'react';

import { SETTING_HEADING_CLASS } from '@/components/ui/appearance-fields';
import { dialogButton } from '@/components/ui/dialog-button';
import { field } from '@/components/ui/field';
import { t } from '@/i18n';
import { TRACE_LEVELS, type TraceArea } from '@/lib/trace';
import { useDiagnosticsDialogStore } from '@/store/use-diagnostics-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 設定の「ログ基準」の欄。そのタブの分野のログの段階と、ログをエクスポートするダイアログの入口。
// ─────────────────────────────

const SELECT = field({ size: 'xs', width: 'control' });

/** 分野 `area` のログの段階を選ぶ欄と、ログをエクスポートするダイアログを開くボタン */
export function DiagnosticsFields({ area }: { readonly area: TraceArea }): React.ReactElement {
  const id = useId();
  const level = useSettingsStore((state) => state.traceLevels[area]);
  const setTraceLevel = useSettingsStore((state) => state.setTraceLevel);
  const openDiagnostics = useDiagnosticsDialogStore((state) => state.open);
  return (
    <>
      <label className={SETTING_HEADING_CLASS} htmlFor={id}>
        {t('settings.diagnostics.heading')}
      </label>
      <p className="text-muted-foreground px-1">{t('settings.diagnostics.note')}</p>
      <select
        id={id}
        className={SELECT}
        value={level}
        onChange={(event) => {
          const picked = TRACE_LEVELS.find((option) => option === event.target.value);
          if (picked !== undefined) setTraceLevel(area, picked);
        }}
      >
        {TRACE_LEVELS.map((option) => (
          <option key={option} value={option}>
            {t(`settings.diagnostics.level.${option}`)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={dialogButton({ tone: 'secondary', className: 'self-start' })}
        onClick={openDiagnostics}
      >
        {t('settings.diagnostics.open')}
      </button>
    </>
  );
}
