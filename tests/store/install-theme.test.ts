// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installTheme } from '@/store/install/install-theme';
import { useSettingsStore } from '@/store/use-settings-store';

function stubSystemTheme(dark: boolean): (dark: boolean) => void {
  const listeners = new Set<() => void>();
  const query = {
    matches: dark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => query);
  return (next) => {
    query.matches = next;
    for (const listener of listeners) listener();
  };
}

const isDark = (): boolean => document.documentElement.classList.contains('dark');

describe('配色の取り付け', () => {
  let uninstall = (): void => undefined;

  afterEach(() => {
    uninstall();
    useSettingsStore.getState().setTheme('system');
    vi.unstubAllGlobals();
  });

  it('OS に従う間は OS の切り替えにその場で追う', () => {
    const setSystemDark = stubSystemTheme(true);
    uninstall = installTheme();
    expect(isDark()).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');

    setSystemDark(false);
    expect(isDark()).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('選んだ組は OS の設定より優先し、変えたらすぐ塗り替える', () => {
    const setSystemDark = stubSystemTheme(false);
    uninstall = installTheme();

    useSettingsStore.getState().setTheme('dark');
    expect(isDark()).toBe(true);
    setSystemDark(false);
    expect(isDark()).toBe(true);

    useSettingsStore.getState().setTheme('light');
    expect(isDark()).toBe(false);
  });
});
