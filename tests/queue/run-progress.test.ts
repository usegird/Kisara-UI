import { describe, expect, it } from 'vitest';

import type { ExecutionProgress, NodeTiming } from '@/queue/execution-state';
import { previousTimingsOf, runProgressOf, type RunProgressInput } from '@/queue/run-progress';

const NODES = ['1', '2', '3', '4'];

const PREVIOUS: readonly NodeTiming[] = [
  { nodeId: '1', startedAt: 0, endedAt: 1000 },
  { nodeId: '2', startedAt: 1000, endedAt: 2000 },
  { nodeId: '3', startedAt: 2000, endedAt: 8000 },
  { nodeId: '4', startedAt: 8000, endedAt: 10_000 },
];

function input(overrides: Partial<RunProgressInput>): RunProgressInput {
  return {
    nodeIds: NODES,
    nodeStates: {},
    cachedNodes: [],
    timings: [],
    runningNode: null,
    step: null,
    previous: null,
    now: 0,
    ...overrides,
  };
}

function ratio(progress: ExecutionProgress | null): number | null {
  return progress === null ? null : progress.value / progress.max;
}

const RUNNING_THIRD: Partial<RunProgressInput> = {
  nodeStates: { '1': 'finished', '2': 'finished', '3': 'running' },
  timings: [
    { nodeId: '1', startedAt: 0, endedAt: 50 },
    { nodeId: '2', startedAt: 50, endedAt: 100 },
    { nodeId: '3', startedAt: 100, endedAt: null },
  ],
  runningNode: '3',
};

const ON_SCHEDULE: Partial<RunProgressInput> = {
  nodeStates: { '1': 'finished', '2': 'finished', '3': 'running' },
  timings: [
    { nodeId: '1', startedAt: 0, endedAt: 1000 },
    { nodeId: '2', startedAt: 1000, endedAt: 2000 },
    { nodeId: '3', startedAt: 2000, endedAt: null },
  ],
  runningNode: '3',
};

describe('実行全体の進み', () => {
  it('前回が無ければノード数で均等割りし、処理中のノードはステップの割合だけ進める', () => {
    const step = { value: 1, max: 4 };
    expect(ratio(runProgressOf(input({ ...RUNNING_THIRD, step })))).toBeCloseTo(2.25 / 4);
  });

  it('前回が無くステップも無ければ、処理中のノードは経過で進めない（時間を見込めない）', () => {
    expect(ratio(runProgressOf(input({ ...RUNNING_THIRD, now: 99_999 })))).toBeCloseTo(0.5);
  });

  it('前回があれば見込みの全体時間を 100% として、経過に比例して一定の速さで進む', () => {
    const at = (now: number): number | null =>
      ratio(runProgressOf(input({ ...ON_SCHEDULE, previous: PREVIOUS, now })));
    expect(at(2500)).toBeCloseTo(0.25);
    expect(at(5000)).toBeCloseTo(0.5);
    expect(at(7500)).toBeCloseTo(0.75);
  });

  it('見込みより早く終わったノードの分は残りから外れて先へ進む', () => {
    const progress = runProgressOf(input({ ...RUNNING_THIRD, previous: PREVIOUS, now: 100 }));
    expect(ratio(progress)).toBeCloseTo(100 / 8100);
  });

  it('見込みより遅れたら、処理中のノードが終わる想定の位置（3 までの 8 秒 / 10 秒）で止める', () => {
    const at = (now: number): number =>
      ratio(runProgressOf(input({ ...ON_SCHEDULE, previous: PREVIOUS, now }))) ?? 0;
    expect(at(7000)).toBeCloseTo(0.7);
    expect(at(9000)).toBeCloseTo(0.8);
    expect(at(12_000)).toBeCloseTo(0.8);
  });

  it('止めていたノードが終わると、次のノードの位置まで進める（戻らない）', () => {
    const progress = runProgressOf(
      input({
        nodeStates: { '1': 'finished', '2': 'finished', '3': 'finished', '4': 'running' },
        timings: [
          { nodeId: '1', startedAt: 0, endedAt: 1000 },
          { nodeId: '2', startedAt: 1000, endedAt: 2000 },
          { nodeId: '3', startedAt: 2000, endedAt: 12_000 },
          { nodeId: '4', startedAt: 12_000, endedAt: null },
        ],
        runningNode: '4',
        previous: PREVIOUS,
        now: 12_000,
      }),
    );
    expect(ratio(progress)).toBeCloseTo(12_000 / 14_000);
  });

  it('刻みの時計が通知より古くても、ノードが替わった時刻までは経過に数える（割合が跳ばない）', () => {
    const progress = runProgressOf(input({ ...ON_SCHEDULE, previous: PREVIOUS, now: 1500 }));
    expect(ratio(progress)).toBeCloseTo(0.2);
  });

  it('前回に時間が無いノードには、時間が分かったノードの平均を見込む', () => {
    const progress = runProgressOf(
      input({
        nodeIds: [...NODES, '5'],
        nodeStates: { '1': 'finished', '2': 'finished', '3': 'finished', '4': 'finished' },
        timings: [{ nodeId: '5', startedAt: 0, endedAt: null }],
        runningNode: '5',
        previous: PREVIOUS,
        now: 1000,
      }),
    );
    expect(ratio(progress)).toBeCloseTo(0.4);
  });

  it('前回があっても、すべてキャッシュで飛ばされれば満ちる', () => {
    const progress = runProgressOf(input({ cachedNodes: NODES, previous: PREVIOUS }));
    expect(ratio(progress)).toBe(1);
  });

  it('キャッシュで飛ばされたノードも終わった分に数え、すべて終われば満ちる', () => {
    const progress = runProgressOf(
      input({ cachedNodes: ['1', '2'], nodeStates: { '3': 'finished', '4': 'finished' } }),
    );
    expect(ratio(progress)).toBe(1);
  });

  it('知らせに出ないノードも、今の実行の時刻で閉じていれば終わった分に数える', () => {
    const timings = [{ nodeId: '1', startedAt: 0, endedAt: 10 }];
    expect(ratio(runProgressOf(input({ timings, runningNode: '2' })))).toBeCloseTo(0.25);
  });

  it('送ったノードが無ければ出さない', () => {
    expect(runProgressOf(input({ nodeIds: [] }))).toBeNull();
  });
});

describe('前回の実行を探す', () => {
  it('送ったノードの半分以上が同じ id の、直前の実行を採る', () => {
    const older = [{ nodeId: '1', startedAt: 0, endedAt: 1 }];
    const promptNodesById = { old: NODES, other: ['7', '8', '9', '1'], now: NODES };
    const nodeTimingsById = { old: older, other: PREVIOUS, now: [] };

    expect(previousTimingsOf('now', promptNodesById, nodeTimingsById)).toBe(older);
  });

  it('時間が 1 つも分からない実行は飛ばし、無ければ null', () => {
    const open = [{ nodeId: '1', startedAt: 0, endedAt: null }];
    const promptNodesById = { a: NODES, now: NODES };

    expect(previousTimingsOf('now', promptNodesById, { a: open })).toBeNull();
    expect(previousTimingsOf('missing', promptNodesById, { a: PREVIOUS })).toBeNull();
  });
});
