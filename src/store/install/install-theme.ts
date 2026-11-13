import { resolveColorScheme } from '@/lib/theme';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 配色をページの根に付け、設定と OS の切り替えに追う。**描く前に**入口から呼ぶ
// （ダークの利用者に白い画面が一瞬出るのを避ける。設定は小さい保存領域から同期で読める）。
// ─────────────────────────────

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** 取り付けて、外す関数を返す（テスト用。アプリでは外さない） */
export function installTheme(): () => void {
  const query = typeof globalThis.matchMedia === 'function' ? matchMedia(DARK_QUERY) : null;
  const root = document.documentElement;

  const apply = (): void => {
    const scheme = resolveColorScheme(useSettingsStore.getState().theme, query?.matches ?? false);
    root.classList.toggle('dark', scheme === 'dark');
    // 入力欄・スクロールバーなどブラウザが描く部品も同じ組にする
    root.style.colorScheme = scheme;
  };

  apply();
  const unsubscribe = useSettingsStore.subscribe((state, previous) => {
    if (state.theme !== previous.theme) apply();
  });
  query?.addEventListener('change', apply);
  return () => {
    unsubscribe();
    query?.removeEventListener('change', apply);
  };
}
