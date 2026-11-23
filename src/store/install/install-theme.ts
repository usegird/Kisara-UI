import { resolveColorScheme } from '@/lib/theme';
import { useSettingsStore } from '@/store/use-settings-store';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function installTheme(): () => void {
  const query = typeof globalThis.matchMedia === 'function' ? matchMedia(DARK_QUERY) : null;
  const root = document.documentElement;

  const apply = (): void => {
    const scheme = resolveColorScheme(useSettingsStore.getState().theme, query?.matches ?? false);
    root.classList.toggle('dark', scheme === 'dark');
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
