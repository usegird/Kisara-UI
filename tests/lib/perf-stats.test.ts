import { beforeEach, describe, expect, it } from 'vitest';

import {
  frameWork,
  recordStat,
  resetStats,
  statCount,
  statRows,
  statsSnapshot,
  type StatRow,
} from '@/lib/perf-stats';

beforeEach(() => {
  resetStats();
});

describe('回数の台帳', () => {
  it('名前ごとに回数と時間の合計・最大を足し込む', () => {
    recordStat('render:A', 2);
    recordStat('render:A', 5);

    expect(statsSnapshot()['render:A']).toEqual({ count: 2, totalMs: 7, maxMs: 5 });
  });

  it('時間を渡さなければ回数だけを数える', () => {
    recordStat('store:graph');

    expect(statsSnapshot()['store:graph']).toEqual({ count: 1, totalMs: 0, maxMs: 0 });
  });

  it('写しは名前の順に並び、書き換えても台帳に響かない', () => {
    recordStat('store:b');
    recordStat('mount:a');

    const snapshot = statsSnapshot();
    expect(Object.keys(snapshot)).toEqual(['mount:a', 'store:b']);
    const entry = snapshot['mount:a'] as { count: number };
    entry.count = 99;
    expect(statCount('mount:a')).toBe(1);
  });

  it('空にすると、まだ数えていない名前と同じく 0 を返す', () => {
    recordStat('render:A');
    resetStats();

    expect(statCount('render:A')).toBe(0);
    expect(statsSnapshot()).toEqual({});
  });
});

describe('表の並び', () => {
  const stat = { count: 1, totalMs: 0, maxMs: 0 };
  const shape = (rows: readonly StatRow[]): string[] =>
    rows.map((row) => `${String(row.depth)} ${row.name}`);

  it('内側の範囲は外側の直後に 1 段下げ、範囲の外の項目は最後に置く', () => {
    const parents = new Map([
      ['App', null],
      ['Panel', 'App'],
      ['Field', 'Panel'],
      ['Card', 'App'],
    ]);
    const snapshot = {
      'frame:long': stat,
      'render:App': stat,
      'render:Card': stat,
      'render:Field': stat,
      'mount:Field': stat,
      'render:Panel': stat,
      'store:graph': stat,
    };

    expect(shape(statRows(snapshot, parents))).toEqual([
      '0 render:App',
      '1 render:Card',
      '1 render:Panel',
      '2 mount:Field',
      '2 render:Field',
      '0 frame:long',
      '0 store:graph',
    ]);
  });

  it('外側に回数が無くても内側の段は変えない。入れ子を知らない範囲は字下げしない', () => {
    const parents = new Map([['Field', 'Panel']]);
    const snapshot = { 'render:Field': stat, 'render:Loose': stat };

    expect(shape(statRows(snapshot, parents))).toEqual(['0 render:Loose', '1 render:Field']);
  });
});

describe('長いフレームの処理時間', () => {
  it('描画待ちだけのフレームは処理 0 とみなす', () => {
    const idle = { startTime: 1000, duration: 734, renderStart: 1733, scripts: [] };
    expect(frameWork(idle)).toBe(1);
  });

  it('スクリプトと描画の時間を足す', () => {
    const busy = {
      startTime: 0,
      duration: 90,
      renderStart: 70,
      scripts: [{ duration: 40 }, { duration: 25 }],
    };
    expect(frameWork(busy)).toBe(85);
  });

  it('形が違えば 0（数えない）', () => {
    expect(frameWork(null)).toBe(0);
    expect(frameWork({ duration: 'x', scripts: 'y' })).toBe(0);
  });
});
