import { cva } from 'class-variance-authority';
import { RefreshCw } from 'lucide-react';

import type { PopupMode } from '@/components/comfy/flow/dialogs/NodeSearchDialog';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// ノードの検索の絞り込みの欄（モードのタブ・型の選択・定義の取り直し）
// ─────────────────────────────

const modeTab = cva(
  'rounded px-3 py-0.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      selected: {
        // 見出しの帯（muted）の上で選んでいるものが分かるよう、濃く塗る
        true: 'bg-primary/60 text-primary-foreground',
        false: 'text-muted-foreground hover:bg-background',
      },
    },
  },
);

/** 何にでも繋がる口（`*`）を型の一致に含めるか。追加と参照で共用 */
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
  /** ノード参照を選べるか（繋ぐ起点があるか） */
  readonly referenceable: boolean;
  readonly onMode: (mode: PopupMode) => void;
}

/**
 * 最上部の「ノード追加」と「ノード参照」の切り替え
 */
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

/**
 * ノード定義の取り直し。探しているノードが無いのはここで気づくので、ここに置く。自動では取り直さない
 */
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

/** 型での絞り込み。先頭は「指定なし」 */
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
