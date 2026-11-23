import { SOURCE_LOCALE } from '../i18n/locales.ts';

export const APP_PATH = '/app/';

export function welcomePathOf(code: string): string {
  return code === SOURCE_LOCALE ? '/' : `/${code}/`;
}

export function moveTo(path: string, history: 'push' | 'replace'): void {
  if (history === 'replace') globalThis.location.replace(path);
  else globalThis.location.assign(path);
}
