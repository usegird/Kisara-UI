// ─────────────────────────────
// 一覧の時期の区切り。会話の一覧とワークフローの一覧が使う。日付は端末の時刻で数える。
// ─────────────────────────────

/** 時期の区切り（今日・昨日・7 日以内・それより前） */
export type ListPeriod = 'today' | 'yesterday' | 'week' | 'older';

/** 同じ時期にまとめた項目の並び */
interface PeriodGroup<T> {
  readonly period: ListPeriod;
  readonly items: readonly T[];
}

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const DAY_MS = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
/** 「7 日以内」の昨日より前の日数（今日・昨日を除く 7 日目の始まりまで） */
const WEEK_DAYS_BEFORE_TODAY = 6;

/** 時刻が、今から見てどの時期に入るか */
export function listPeriod(time: number, now: number): ListPeriod {
  const day = new Date(now);
  const startOfToday = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  if (time >= startOfToday) return 'today';
  if (time >= startOfToday - DAY_MS) return 'yesterday';
  if (time >= startOfToday - WEEK_DAYS_BEFORE_TODAY * DAY_MS) return 'week';
  return 'older';
}

/** 新しい順に並べ、続く同じ時期を 1 つの区切りにまとめる。時刻の無いものは「それより前」の末尾 */
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
