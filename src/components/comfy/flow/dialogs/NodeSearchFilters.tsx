import { cva } from 'class-variance-authority';
import { RefreshCw } from 'lucide-react';

import type { PopupMode } from '@/components/comfy/flow/dialogs/NodeSearchDialog';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';

const modeTab = cva(
  'rounded px-3 py-0.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      selected: {
        true: 'bg-primary/60 text-primary-foreground',
        false: 'text-muted-foreground hover:bg-background',
      },
    },
  },
);

export function AnyTypeCheckbox({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): React.ReactElement {
  return (
    <label className="flex shrink-0 items-center gap-1" title={t('nodeSearch.anyType.title')}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {t('nodeSearch.anyType.label')}
    </label>
  );
}

const SELECT_CLASS = 'border-input min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5';

interface ModeTabsProps {
  readonly mode: PopupMode;
  readonly referenceable: boolean;
  readonly onMode: (mode: PopupMode) => void;
}

export function ModeTabs({ mode, referenceable, onMode }: ModeTabsProps): React.ReactElement {
  return (
    <div
      role="tablist"
      aria-label={t('nodeSearch.mode.label')}
      className="flex shrink-0 items-center gap-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'add'}
        className={modeTab({ selected: mode === 'add' })}
        onClick={() => onMode('add')}
      >
        {t('nodeSearch.mode.add')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'reference'}
        className={modeTab({ selected: mode === 'reference' })}
        disabled={!referenceable}
        title={
          referenceable
            ? t('nodeSearch.mode.referenceTitle')
            : t('nodeSearch.mode.referenceDisabled')
        }
        onClick={() => onMode('reference')}
      >
        {t('nodeSearch.mode.reference')}
      </button>
    </div>
  );
}

export function RefreshDefinitionsButton(): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const loading = useDefinitionsStore((state) => state.status === 'loading');
  const refreshDefinitions = useDefinitionsStore((state) => state.refresh);
  return (
    <button
      type="button"
      className={DIALOG_ICON_CLASS}
      aria-label={t('nodeSearch.refresh.label')}
      title={t('nodeSearch.refresh.title')}
      disabled={loading || baseUrl.length === 0}
      onClick={guardPress('definitions-refresh', () => void refreshDefinitions(baseUrl))}
    >
      <RefreshCw className={refreshIcon({ loading })} aria-hidden />
    </button>
  );
}

interface TypeSelectProps {
  readonly label: string;
  readonly title: string;
  readonly ariaLabel: string;
  readonly value: string;
  readonly types: readonly string[];
  readonly onChange: (type: string) => void;
}

export function TypeSelect({
  label,
  title,
  ariaLabel,
  value,
  types,
  onChange,
}: TypeSelectProps): React.ReactElement {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1" title={title}>
      {label}
      <select
        className={SELECT_CLASS}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('nodeSearch.filter.unspecified')}</option>
        {types.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </label>
  );
}
