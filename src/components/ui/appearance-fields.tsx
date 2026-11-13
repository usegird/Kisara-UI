import { useId } from 'react';

import { field } from '@/components/ui/field';
import { SettingSwitch } from '@/components/ui/setting-switch';
import { activeLocale, saveLocale, t } from '@/i18n';
import { LOCALES } from '@/i18n/locales';
import { reloadPage } from '@/lib/reload-page';
import { THEME_PREFERENCES } from '@/lib/theme';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 画面の言語と配色、タブの並べ方の欄。ComfyUI の設定のタブと、会話の設定のタブで同じものを使う。
// 欄の id は部品ごとに作る（2 つの列に同時に出ても重ならない）
// ─────────────────────────────

const SELECT = field({ size: 'xs', width: 'control' });

/**
 * 設定のタブの欄の見出し（言語・配色・アバターなど）。上の欄（入力欄・スイッチ）との間は、並びの間隔に
 * 12px 足す
 */
export const SETTING_HEADING_CLASS = 'text-foreground mt-3 px-1';

/**
 * 画面の言語。開いている間は変えないので、選んだら残して読み込み直す
 */
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

/**
 * 画面の配色。言語と違い、読み込み直さずにその場で塗り替える
 * （根の印は入口で取り付けたものが設定の変更に追う）
 */
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

/**
 * 会話のタブをワークフローのタブより左へ自動で寄せるかのスイッチ。どちらの設定のタブにも出す
 */
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
