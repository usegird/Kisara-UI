import { activeLocale, t } from '@/i18n';

export const EMPTY_MARK = '—';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

function cached<T>(make: (locale: string) => T): () => T {
  let made: { locale: string; value: T } | null = null;
  return () => {
    const locale = activeLocale();
    if (made?.locale !== locale) made = { locale, value: make(locale) };
    return made.value;
  };
}

const dateTime = cached(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
);

const dateTimeSeconds = cached(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }),
);

const timeOfDay = cached(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }),
);

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(activeLocale(), options);
}

export function formatDateTime(milliseconds: number | null): string {
  return milliseconds === null ? '' : dateTime().format(milliseconds);
}

export function formatDateTimeSeconds(milliseconds: number | null): string {
  return milliseconds === null ? '' : dateTimeSeconds().format(milliseconds);
}

export function formatTime(milliseconds: number | null): string {
  return milliseconds === null ? '' : timeOfDay().format(milliseconds);
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) return EMPTY_MARK;

  const seconds = durationMs / MS_PER_SECOND;
  if (seconds < SECONDS_PER_MINUTE) return t('format.seconds', { seconds: seconds.toFixed(1) });

  return t('format.minutesSeconds', {
    minutes: Math.floor(seconds / SECONDS_PER_MINUTE),
    seconds: String(Math.floor(seconds % SECONDS_PER_MINUTE)).padStart(2, '0'),
  });
}

export function formatElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / MS_PER_SECOND));
  return t('format.elapsed', {
    minutes: Math.floor(seconds / SECONDS_PER_MINUTE),
    seconds: String(seconds % SECONDS_PER_MINUTE).padStart(2, '0'),
  });
}

export function formatDisplayValue(value: unknown): string {
  if (value === undefined || value === null) return EMPTY_MARK;
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  if (typeof value === 'string') return value.length === 0 ? t('format.empty') : value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}
