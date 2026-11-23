export type ListPeriod = 'today' | 'yesterday' | 'week' | 'older';

interface PeriodGroup<T> {
  readonly period: ListPeriod;
  readonly items: readonly T[];
}

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const DAY_MS = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
const WEEK_DAYS_BEFORE_TODAY = 6;

export function listPeriod(time: number, now: number): ListPeriod {
  const day = new Date(now);
  const startOfToday = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  if (time >= startOfToday) return 'today';
  if (time >= startOfToday - DAY_MS) return 'yesterday';
  if (time >= startOfToday - WEEK_DAYS_BEFORE_TODAY * DAY_MS) return 'week';
  return 'older';
}

export function groupByPeriod<T>(
  items: readonly T[],
  timeOf: (item: T) => number | null,
  now: number,
): PeriodGroup<T>[] {
  const sorted = [...items].sort((a, b) => (timeOf(b) ?? -Infinity) - (timeOf(a) ?? -Infinity));
  const groups: { period: ListPeriod; items: T[] }[] = [];
  for (const item of sorted) {
    const time = timeOf(item);
    const period = time === null ? 'older' : listPeriod(time, now);
    const last = groups.at(-1);
    if (last?.period === period) last.items.push(item);
    else groups.push({ period, items: [item] });
  }
  return groups;
}
