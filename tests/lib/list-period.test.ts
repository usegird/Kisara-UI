import { describe, expect, it } from 'vitest';

import { groupByPeriod, listPeriod } from '@/lib/list-period';

// 一覧の時期の区切り（会話の一覧とワークフローの一覧で共用）

const NOW = new Date(2026, 9, 31, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

describe('一覧の時期の区切り', () => {
  it('今日・昨日・7 日以内・それより前に分ける', () => {
    expect(listPeriod(NOW - 60_000, NOW)).toBe('today');
    expect(listPeriod(NOW - DAY, NOW)).toBe('yesterday');
    expect(listPeriod(NOW - 6 * DAY, NOW)).toBe('week');
    expect(listPeriod(NOW - 8 * DAY, NOW)).toBe('older');
  });

  it('新しい順に並べて同じ時期をまとめ、時刻の無いものは最後の「それより前」に入れる', () => {
    const items = [
      { id: 'none', time: null },
      { id: 'old', time: NOW - 30 * DAY },
      { id: 'now', time: NOW },
      { id: 'today', time: NOW - 60_000 },
    ];
    const groups = groupByPeriod(items, (item) => item.time, NOW);
    expect(groups.map((group) => group.period)).toEqual(['today', 'older']);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['now', 'today']);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(['old', 'none']);
  });
});
