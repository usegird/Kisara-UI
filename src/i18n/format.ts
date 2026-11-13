import { activeLocale, t } from '@/i18n';

// ─────────────────────────────
// 言語で形の変わる書式。**画面に出す形は用途ごとに 1 つ**に揃え、部品の中で書式を作らない。
// 言語に依らない値の文字列化は `@/lib/text`。
// ─────────────────────────────

/** 値が無いことを示す印 */
export const EMPTY_MARK = '—';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/** 書式の道具は言語ごとに 1 回だけ作る（言語は開いている間変わらないが、テストでは変わる） */
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

/** 数を画面の言語の書き方（桁の区切り・小数点）で出す */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(activeLocale(), options);
}

/** 日時（分まで）。分からなければ空 */
export function formatDateTime(milliseconds: number | null): string {
  return milliseconds === null ? '' : dateTime().format(milliseconds);
}

/** 日時（秒まで。履歴の詳細の実行を見分ける）。分からなければ空 */
export function formatDateTimeSeconds(milliseconds: number | null): string {
  return milliseconds === null ? '' : dateTimeSeconds().format(milliseconds);
}

/** 時刻（時:分:秒）。分からなければ空 */
export function formatTime(milliseconds: number | null): string {
  return milliseconds === null ? '' : timeOfDay().format(milliseconds);
}

/** 処理時間。分を超えたら分と秒、それ未満は秒（小数 1 桁）。分からなければ — */
export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) return EMPTY_MARK;

  const seconds = durationMs / MS_PER_SECOND;
  if (seconds < SECONDS_PER_MINUTE) return t('format.seconds', { seconds: seconds.toFixed(1) });

  return t('format.minutesSeconds', {
    minutes: Math.floor(seconds / SECONDS_PER_MINUTE),
    seconds: String(Math.floor(seconds % SECONDS_PER_MINUTE)).padStart(2, '0'),
  });
}

/** 経過時間（受け取り中の時計）。いつも分と秒で、秒は 2 桁 */
export function formatElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / MS_PER_SECOND));
  return t('format.elapsed', {
    minutes: Math.floor(seconds / SECONDS_PER_MINUTE),
    seconds: String(seconds % SECONDS_PER_MINUTE).padStart(2, '0'),
  });
}

/**
 * 読み取り表示のラベル。**未設定と空文字列を見分けられる**ように記号で示す
 * （`@/lib/text` の `formatValue` / `formatEditValue` と並ぶ 3 本目。空文字列の表記だけ言語で変わる）
 */
export function formatDisplayValue(value: unknown): string {
  if (value === undefined || value === null) return EMPTY_MARK;
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  if (typeof value === 'string') return value.length === 0 ? t('format.empty') : value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}
