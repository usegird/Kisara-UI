import { useId } from 'react';

import { field } from '@/components/ui/field';
import { SettingSwitch } from '@/components/ui/setting-switch';
import { activeLocale, saveLocale, t } from '@/i18n';
import { LOCALES } from '@/i18n/locales';
import { reloadPage } from '@/lib/reload-page';
import { THEME_PREFERENCES } from '@/lib/theme';
import { useSettingsStore } from '@/store/use-settings-store';

const SELECT = field({ size: 'xs', width: 'control' });

export const SETTING_HEADING_CLASS = 'text-foreground mt-3 px-1';

export function LanguageSelect(): React.ReactElement {
  const id = useId();
  return (
    <>
      <label className={SETTING_HEADING_CLASS} htmlFor={id}>
        {t('settings.language.label')}
      </label>
      <select
        id={id}
        className={SELECT}
        defaultValue={activeLocale()}
        onChange={(event) => {
          saveLocale(event.target.value);
          reloadPage();
        }}
      >
        {LOCALES.map((locale) => (
          <option key={locale.code} value={locale.code} lang={locale.code}>
            {locale.nativeName}
          </option>
        ))}
      </select>
    </>
  );
}

export function ThemeSelect(): React.ReactElement {
  const id = useId();
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  return (
    <>
      <label className={SETTING_HEADING_CLASS} htmlFor={id}>
        {t('settings.theme.label')}
      </label>
      <select
        id={id}
        className={SELECT}
        value={theme}
        onChange={(event) => {
          const picked = THEME_PREFERENCES.find((option) => option === event.target.value);
          if (picked !== undefined) setTheme(picked);
        }}
      >
        {THEME_PREFERENCES.map((option) => (
          <option key={option} value={option}>
            {t(`settings.theme.${option}`)}
          </option>
        ))}
      </select>
    </>
  );
}

export function ChatTabsFirstSwitch(): React.ReactElement {
  const on = useSettingsStore((state) => state.chatTabsFirst);
  return (
    <>
      <span className={SETTING_HEADING_CLASS}>{t('settings.tabs.heading')}</span>
      <SettingSwitch
        checked={on}
        onChange={(next) => useSettingsStore.getState().setChatTabsFirst(next)}
        label={t('settings.tabs.chatFirst')}
        spaced={false}
      />
    </>
  );
}
