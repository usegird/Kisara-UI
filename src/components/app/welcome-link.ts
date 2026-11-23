import { activeLocale } from '@/i18n';
import { moveTo, welcomePathOf } from '@/welcome/paths';

export function welcomeHref(): string {
  return welcomePathOf(activeLocale());
}

export function moveToWelcome(): void {
  moveTo(welcomeHref(), 'replace');
}
