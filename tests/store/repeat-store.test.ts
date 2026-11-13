import { beforeEach, describe, expect, it } from 'vitest';

import { repeatOutcome, useRepeatStore, type RepeatSignals } from '@/store/use-repeat-store';

// ─────────────────────────────
// 繰り返し実行。正常に終わったときと実行中の失敗では続け、
// 中断でも止まらない。通知で見ていなかった分は履歴の控えで決める。
// ─────────────────────────────

function signals(
  status: string,
  { promptId = 'p1', logged = null as boolean | null } = {},
): RepeatSignals {
  return { execution: { promptId, status }, logged };
}

describe('1 件の決着', () => {
  it('正常に終われば・中断されても次へ', () => {
    expect(repeatOutcome('p1', signals('done'))).toBe('next');
  });

  it('失敗は失敗として返す', () => {
    expect(repeatOutcome('p1', signals('failed'))).toBe('failed');
  });

  it('見失った実行（再起動などで結果が出ない）は待たずに失敗として数える', () => {
    expect(repeatOutcome('p1', signals('unknown'))).toBe('failed');
  });

  it('走っている間は待つ', () => {
    expect(repeatOutcome('p1', signals('running'))).toBe('pending');
  });

  it('通知で見ていない実行は履歴の控えで決める', () => {
    const other = { promptId: 'p2' };
    expect(repeatOutcome('p1', signals('done', other))).toBe('pending');
    expect(repeatOutcome('p1', signals('done', { ...other, logged: true }))).toBe('next');
    expect(repeatOutcome('p1', signals('running', { ...other, logged: false }))).toBe('failed');
  });
});

describe('繰り返しの状態', () => {
  beforeEach(() => useRepeatStore.setState({ jobs: [] }));

  const jobOf = (tabId: string) => useRepeatStore.getState().jobs.find((j) => j.tabId === tabId);

  it('投げるたびに回数を進め、手放すと id だけ外れる', () => {
    const repeat = useRepeatStore.getState();
    repeat.begin('tab-1');
    repeat.submitted('tab-1', 'p1');
    repeat.release('tab-1', false);
    repeat.submitted('tab-1', 'p2');

    expect(jobOf('tab-1')).toMatchObject({ count: 2, promptId: 'p2' });
  });

  it('失敗が続いた回数を数え、正常に終われば 0 に戻す', () => {
    const repeat = useRepeatStore.getState();
    repeat.begin('tab-1');
    repeat.release('tab-1', true);
    repeat.release('tab-1', true);
    expect(jobOf('tab-1')?.failures).toBe(2);

    repeat.release('tab-1', false);
    expect(jobOf('tab-1')?.failures).toBe(0);
  });

  it('タブごとに 1 つ、始めた順に並べる。最中のタブでは始めない。止めるのはそのタブだけ', () => {
    const repeat = useRepeatStore.getState();
    expect(repeat.begin('tab-1')).toBe(true);
    expect(repeat.begin('tab-2')).toBe(true);
    expect(repeat.begin('tab-1')).toBe(false);
    repeat.submitted('tab-2', 'p9');
    expect(useRepeatStore.getState().jobs.map((j) => j.tabId)).toEqual(['tab-1', 'tab-2']);
    expect(jobOf('tab-1')?.count).toBe(0);

    repeat.stop('tab-1');
    expect(useRepeatStore.getState().jobs.map((j) => j.tabId)).toEqual(['tab-2']);
  });
});
