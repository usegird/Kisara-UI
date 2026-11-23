import { describe, expect, it } from 'vitest';

import { parseHistory, parseQueue } from '@/comfy/schema';
import { formatDuration } from '@/i18n/format';
import { pickImage } from '@/queue/outputs';
import {
  adjacentTask,
  buildQueueTasks,
  followTarget,
  LOCAL_TASK_ID,
  otherRuns,
  progressRatio,
  type CurrentRun,
} from '@/queue/queue-tasks';
import type { TaskLogEntry } from '@/queue/task-log';

import { historyEntry, queueEntry, queueTask, taskLogEntry } from '../helpers/queue';

const NO_RUN: CurrentRun = {
  promptId: null,
  status: 'idle',
  progress: null,
  startedAt: null,
  finishedAt: null,
  error: null,
  outputsById: {},
};

describe('キューの応答', () => {
  it('実行中と待機を配列から読む', () => {
    const queue = parseQueue({
      queue_running: [[3, 'a', {}, { client_id: 'c1', kisara: { session: 'tab-1' } }, []]],
      queue_pending: [
        [4, 'b', {}],
        [5, 'c', {}],
      ],
    });

    expect(queue.running).toEqual([queueEntry('a', 3, null, 'tab-1')]);
    expect(queue.pending[0]?.session).toBeNull();
    expect(queue.pending.map((entry) => entry.promptId)).toEqual(['b', 'c']);
  });

  it('投入時刻を extra_data から読む', () => {
    const queue = parseQueue({
      queue_running: [[3, 'a', {}, { create_time: 1_789_623_200_482 }, []]],
    });

    expect(queue.running[0]?.createdAt).toBe(1_789_623_200_482);
  });

  it('想定外の形は落とす', () => {
    expect(parseQueue(null)).toEqual({ running: [], pending: [] });
    expect(parseQueue({ queue_running: [42, [], [1]] }).running).toEqual([]);
  });

  it('履歴は番号・出力・時刻を取り、新しい順に並ぶ', () => {
    const history = parseHistory({
      old: {
        prompt: [12, 'old', {}, {}, []],
        outputs: { '9': { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] } },
        status: {
          status_str: 'success',
          messages: [
            ['execution_start', { timestamp: 1000 }],
            ['execution_success', { timestamp: 4000 }],
          ],
        },
      },
      recent: {
        outputs: {},
        status: { status_str: 'error', messages: [['execution_error', { timestamp: 9000 }]] },
      },
    });

    expect(history.map((entry) => entry.promptId)).toEqual(['recent', 'old']);
    expect(history[1]?.number).toBe(12);
    expect(history[1]?.outputs).toEqual([{ filename: 'a.png', subfolder: '', type: 'output' }]);
    expect(history[1]?.startedAt).toBe(1000);
    expect(history[1]?.finishedAt).toBe(4000);
    expect(history[0]?.success).toBe(false);
  });

  it('status が無くても落ちない', () => {
    const history = parseHistory({ x: { outputs: {} } });

    expect(history[0]).toEqual({
      promptId: 'x',
      number: null,
      outputs: [],
      success: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      session: null,
    });
  });
});

describe('キュー列の組み立て', () => {
  it('新しいものほど上（待機 → 実行中 → 履歴）', () => {
    const tasks = buildQueueTasks({
      running: [queueEntry('a', 1)],
      pending: [queueEntry('b', 2)],
      history: [
        {
          promptId: 'z',
          number: null,
          outputs: [],
          success: true,
          startedAt: 0,
          finishedAt: 2500,
          error: null,
          session: null,
        },
      ],
      current: NO_RUN,
      now: 0,
    });

    expect(tasks.map((task) => [task.promptId, task.state])).toEqual([
      ['b', 'pending'],
      ['a', 'running'],
      ['z', 'done'],
    ]);
    expect(tasks[2]?.durationMs).toBe(2500);
  });

  it('自分が投げた実行だけ進捗と経過時間を出す', () => {
    const current: CurrentRun = {
      ...NO_RUN,
      promptId: 'a',
      status: 'running',
      progress: { value: 3, max: 10 },
      startedAt: 1_000,
      outputsById: { a: { '9': [{ filename: 'b.png', subfolder: '', type: 'temp' }] } },
    };
    const [mine, other] = buildQueueTasks({
      running: [queueEntry('a', 1), queueEntry('other', 2)],
      pending: [],
      history: [],
      current,
      now: 4_500,
    });

    expect(mine?.progress).toEqual({ value: 3, max: 10 });
    expect(mine?.durationMs).toBe(3_500);
    expect(mine?.outputs).toEqual([{ filename: 'b.png', subfolder: '', type: 'temp' }]);
    expect(other?.progress).toBeNull();
    expect(other?.durationMs).toBeNull();
    expect(other?.outputs).toEqual([]);
  });

  it('終わった直後でキューにも履歴にも居ない自分の実行は、手元の出力で出す', () => {
    const file = { filename: 'b.png', subfolder: '', type: 'temp' };
    const current: CurrentRun = {
      ...NO_RUN,
      promptId: 'b',
      status: 'done',
      outputsById: { b: { 9: [file] } },
    };
    const gap = buildQueueTasks({
      running: [],
      pending: [],
      history: [historyEntry('a', 1)],
      logged: [taskLogEntry('b')],
      current,
      now: 0,
    });
    expect(gap.map((task) => [task.promptId, task.state])).toEqual([
      ['b', 'done'],
      ['a', 'done'],
    ]);
    expect(gap[0]?.outputs).toEqual([file]);

    const settled = buildQueueTasks({
      running: [],
      pending: [],
      history: [historyEntry('b', 2, { outputs: [file] }), historyEntry('a', 1)],
      current,
      now: 0,
    });
    expect(settled.map((task) => task.promptId)).toEqual(['b', 'a']);
    expect(settled[0]?.number).toBe(2);
  });

  it('まだ動いている実行は、写しに居なくても終わったものとして出さない', () => {
    const file = { filename: 'b.png', subfolder: '', type: 'temp' };
    const tasks = buildQueueTasks({
      running: [],
      pending: [],
      history: [],
      current: { ...NO_RUN, promptId: 'b', status: 'running', outputsById: { b: { 9: [file] } } },
      now: 0,
    });

    expect(tasks).toEqual([]);
  });

  it('次の実行へ移っても、キューの写しが古い間は前の実行の出力を出す', () => {
    const file = { filename: 'a.png', subfolder: '', type: 'output' };
    const [previous] = buildQueueTasks({
      running: [queueEntry('a', 1)],
      pending: [],
      history: [],
      current: {
        ...NO_RUN,
        promptId: 'b',
        status: 'running',
        outputsById: { a: { 9: [file] } },
      },
      now: 0,
    });

    expect(previous?.outputs).toEqual([file]);
  });

  it('自分の実行でなくても、投入時刻が取れれば経過時間を出す', () => {
    const [task] = buildQueueTasks({
      running: [queueEntry('other', 0, 1_000)],
      pending: [],
      history: [],
      current: NO_RUN,
      now: 8_000,
    });

    expect(task?.startedAt).toBe(1_000);
    expect(task?.durationMs).toBe(7_000);
  });

  it('自分の実行なら通知の開始時刻を優先する', () => {
    const [task] = buildQueueTasks({
      running: [queueEntry('a', 0, 1_000)],
      pending: [],
      history: [],
      current: { ...NO_RUN, promptId: 'a', status: 'running', startedAt: 3_000 },
      now: 8_000,
    });

    expect(task?.startedAt).toBe(3_000);
  });

  it('キューに残っているものは履歴側を出さない', () => {
    const tasks = buildQueueTasks({
      running: [queueEntry('a', 1)],
      pending: [],
      history: [
        {
          promptId: 'a',
          number: null,
          outputs: [],
          success: true,
          startedAt: 0,
          finishedAt: 1,
          error: null,
          session: null,
        },
      ],
      current: NO_RUN,
      now: 0,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.state).toBe('running');
  });

  it('不明の実行は消さずに出す（失敗にも成功にもしない）', () => {
    const [task] = buildQueueTasks({
      running: [],
      pending: [],
      history: [],
      current: {
        ...NO_RUN,
        promptId: 'gone',
        status: 'unknown',
        error: '結果を確認できませんでした',
      },
      now: 0,
    });

    expect(task?.promptId).toBe('gone');
    expect(task?.state).toBe('unknown');
    expect(task?.message).toBe('結果を確認できませんでした');
  });

  it('失敗した実行は失敗として出す', () => {
    const [task] = buildQueueTasks({
      running: [],
      pending: [],
      history: [
        {
          promptId: 'z',
          number: null,
          outputs: [],
          success: false,
          startedAt: null,
          finishedAt: null,
          error: { kind: 'error', line: 'CUDA out of memory', nodeId: null },
          session: null,
        },
      ],
      current: NO_RUN,
      now: 0,
    });

    expect(task?.state).toBe('failed');
    expect(task?.durationMs).toBeNull();
    expect(task?.message).toBe('CUDA out of memory');
  });
});

describe('処理時間と進捗の表記', () => {
  it('分未満は秒、超えたら分と秒', () => {
    expect(formatDuration(2_450)).toBe('2.5秒');
    expect(formatDuration(95_000)).toBe('1分35秒');
    expect(formatDuration(null)).toBe('—');
  });

  it('割合は 0〜1 に収める', () => {
    const task = {
      promptId: 'a',
      state: 'running' as const,
      number: null,
      outputs: [],
      durationMs: null,
      message: null,
      startedAt: null,
      progress: { value: 15, max: 10 },
    };

    expect(progressRatio(task)).toBe(1);
    expect(progressRatio({ ...task, progress: { value: 2, max: 8 } })).toBe(0.25);
    expect(progressRatio({ ...task, progress: { value: 1, max: 0 } })).toBeNull();
    expect(progressRatio({ ...task, progress: null })).toBeNull();
  });
});

describe('受理されなかった実行', () => {
  const rejectedEntry = (promptId: string, at: number, message: string): TaskLogEntry =>
    taskLogEntry(promptId, {
      startedAt: at,
      finishedAt: at,
      success: false,
      rejection: {
        reason: 'Prompt outputs failed validation',
        nodes: [{ nodeId: '7', classType: 'Encode', messages: [message], inputNames: [null] }],
      },
    });

  it('断られるたびに 1 件ずつ出し、終わったタスクの間に時刻の順で並べる', () => {
    const tasks = buildQueueTasks({
      running: [queueEntry('r', 5)],
      pending: [],
      history: [
        {
          promptId: 'z',
          number: null,
          outputs: [],
          success: true,
          startedAt: 2000,
          finishedAt: 3000,
          error: null,
          session: null,
        },
      ],
      logged: [
        rejectedEntry('rejected:3', 5000, 'Value not in list'),
        rejectedEntry('rejected:1', 1000, 'Required input is missing'),
      ],
      current: { ...NO_RUN, status: 'failed', error: 'Value not in list' },
      now: 0,
    });

    expect(tasks.map((task) => task.promptId)).toEqual(['r', 'rejected:3', 'z', 'rejected:1']);
    expect(tasks.some((task) => task.promptId === LOCAL_TASK_ID)).toBe(false);
    expect(tasks[1]?.message).toBe('#7 Encode: Value not in list');
    expect(tasks[1]?.state).toBe('failed');
  });

  it('受理されてキューに載っているものは二重に出さない', () => {
    const tasks = buildQueueTasks({
      running: [queueEntry('a', 1)],
      pending: [],
      history: [],
      current: { ...NO_RUN, promptId: 'a', status: 'queued' },
      now: 0,
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.state).toBe('running');
  });

  it('待機中はサーバーの一覧に出る前でも見える', () => {
    const [task] = buildQueueTasks({
      running: [],
      pending: [],
      history: [],
      current: { ...NO_RUN, promptId: 'a', status: 'queued' },
      now: 0,
    });

    expect(task?.state).toBe('pending');
  });
});

describe('端末に控えたタスク', () => {
  const logged = [
    {
      promptId: 'old',
      number: 7,
      startedAt: 1_000,
      finishedAt: 3_000,
      success: true,
      outputs: [{ filename: 'a.png', subfolder: '', type: 'output' }],
      name: 'Krea2_T2I',
    },
  ];

  it('サーバーの履歴から消えていても出す（再起動で履歴が飛ぶため）', () => {
    const [task] = buildQueueTasks({
      running: [],
      pending: [],
      history: [],
      logged,
      current: NO_RUN,
      now: 0,
    });

    expect(task?.promptId).toBe('old');
    expect(task?.number).toBe(7);
    expect(task?.durationMs).toBe(2_000);
    expect(task?.outputs).toHaveLength(1);
  });

  it('サーバーの履歴にあるものは二重に出さない', () => {
    const tasks = buildQueueTasks({
      running: [],
      pending: [],
      history: [
        {
          promptId: 'old',
          number: 7,
          outputs: [],
          success: true,
          startedAt: 0,
          finishedAt: 1,
          error: null,
          session: null,
        },
      ],
      logged,
      current: NO_RUN,
      now: 0,
    });

    expect(tasks).toHaveLength(1);
  });

  it('結果も終了時刻も無い控えは出さない', () => {
    const tasks = buildQueueTasks({
      running: [],
      pending: [],
      history: [],
      logged: [{ ...logged[0]!, outputs: [], finishedAt: null }],
      current: NO_RUN,
      now: 0,
    });

    expect(tasks).toEqual([]);
  });
});

describe('代表画像の選び方', () => {
  const temp = { filename: 'preview.png', subfolder: '', type: 'temp' };
  const output = { filename: 'saved.png', subfolder: '', type: 'output' };

  it('再起動で消える temp より output を優先する', () => {
    expect(pickImage([temp, output])).toBe(output);
  });

  it('output が無ければあるものを使う', () => {
    expect(pickImage([temp])).toBe(temp);
  });

  it('画像以外は選ばない', () => {
    expect(pickImage([{ filename: 'a.mp4', subfolder: '', type: 'output' }])).toBeNull();
    expect(pickImage([])).toBeNull();
  });
});

describe('待機の並び', () => {
  it('後から足したもの（番号が大きいもの）を上に出す', () => {
    const tasks = buildQueueTasks({
      running: [queueEntry('run', 10)],
      pending: [queueEntry('first', 11), queueEntry('later', 12)],
      history: [],
      current: NO_RUN,
      now: 0,
    });

    expect(tasks.map((task) => task.promptId)).toEqual(['later', 'first', 'run']);
  });
});

describe('隣のタスク', () => {
  const tasks = buildQueueTasks({
    running: [],
    pending: [],
    history: [
      {
        promptId: 'a',
        number: 3,
        outputs: [],
        success: true,
        startedAt: null,
        finishedAt: null,
        error: null,
        session: null,
      },
      {
        promptId: 'b',
        number: 2,
        outputs: [],
        success: true,
        startedAt: null,
        finishedAt: null,
        error: null,
        session: null,
      },
    ],
    current: NO_RUN,
    now: 0,
  });

  it('左が新しい方、右が古い方', () => {
    expect(adjacentTask(tasks, 'b', -1)?.promptId).toBe('a');
    expect(adjacentTask(tasks, 'a', 1)?.promptId).toBe('b');
  });

  it('端では動かない', () => {
    expect(adjacentTask(tasks, 'a', -1)).toBeNull();
    expect(adjacentTask(tasks, 'b', 1)).toBeNull();
  });

  it('並びから消えたものは動かない', () => {
    expect(adjacentTask(tasks, '知らない', 1)).toBeNull();
    expect(adjacentTask(tasks, null, 1)).toBeNull();
  });
});

describe('キューの写しが古いとき', () => {
  const failed: CurrentRun = {
    promptId: 'a',
    status: 'failed',
    progress: { value: 3, max: 20 },
    startedAt: 1_000,
    finishedAt: 4_000,
    error: '落ちました',
    outputsById: {},
  };

  const build = (current: CurrentRun) =>
    buildQueueTasks({
      running: [queueEntry('a', 3)],
      pending: [],
      history: [],
      current,
      now: 9_000,
    });

  it('サーバーが実行中と言っていても、手元の失敗を出す', () => {
    const task = build(failed)[0];

    expect(task?.state).toBe('failed');
    expect(task?.message).toBe('落ちました');
    expect(task?.durationMs).toBe(3_000);
  });

  it('不明のものも実行中に見せない', () => {
    const task = build({ ...failed, status: 'unknown', error: '確認できません' })[0];

    expect(task?.state).toBe('unknown');
  });

  it('動いている間はそのまま実行中', () => {
    const task = build({ ...failed, status: 'running', finishedAt: null })[0];

    expect(task?.state).toBe('running');
    expect(task?.durationMs).toBe(8_000);
  });
});

describe('通知が途切れているとき', () => {
  const build = (stall: { message: string; unknown: boolean }) =>
    buildQueueTasks({
      running: [queueEntry('a', 3)],
      pending: [queueEntry('b', 4)],
      history: [],
      current: NO_RUN,
      now: 9_000,
      stall,
    });

  it('張り直している間は実行中のまま、リトライの回数だけを添える', () => {
    const [pending, running] = build({ message: 'リトライ (4/10)', unknown: false });

    expect(running?.state).toBe('running');
    expect(running?.message).toBe('リトライ (4/10)');
    expect(running?.durationMs).toBeNull();
    expect(pending?.state).toBe('pending');
    expect(pending?.message).toBeNull();
  });

  it('諦めたら、実行中・待機を見失ったものにする（終わったことにしない）', () => {
    const tasks = build({ message: 'タイムアウト', unknown: true });

    expect(tasks.map((task) => task.state)).toEqual(['unknown', 'unknown']);
    expect(tasks.every((task) => task.message === 'タイムアウト')).toBe(true);
    expect(tasks.every((task) => task.durationMs === null)).toBe(true);
  });
});

describe('詳細の追従で移る先', () => {
  it('最後に終わったもの（走っている・待っているものには移らない）', () => {
    const pending = queueTask('p', [], { state: 'pending' });
    const running = queueTask('r', [], { state: 'running' });
    const done = queueTask('d', []);

    expect(followTarget([pending, running, done])).toBe('d');
    expect(followTarget([running])).toBeNull();
    expect(followTarget([pending, done])).toBe('d');
    expect(followTarget([pending])).toBeNull();
  });
});

describe('控えだけに残った実行', () => {
  it('失敗したものは、控えた失敗の 1 行をカードに出す', () => {
    const [task] = buildQueueTasks({
      running: [],
      pending: [],
      history: [],
      logged: [taskLogEntry('f', { startedAt: 1, finishedAt: 2, success: false, error: 'boom' })],
      current: NO_RUN,
      now: 0,
    });

    expect(task?.state).toBe('failed');
    expect(task?.message).toBe('boom');
  });
});

describe('このタブの実行だけを出す', () => {
  const running = [queueEntry('r-me', 1, null, 'me'), queueEntry('r-other', 2, null, 'other')];
  const pending = [queueEntry('p-me', 3, null, 'me'), queueEntry('p-none', 4, null, null)];
  const history = [
    historyEntry('h-me', 0, { session: 'me' }),
    historyEntry('h-other', 0, { session: 'other' }),
  ];

  it('セッションを渡すと、それらで送った実行だけをカードにする', () => {
    const tasks = buildQueueTasks({
      running,
      pending,
      history,
      current: NO_RUN,
      now: 0,
      sessions: ['me', 'old'],
    });

    expect(tasks.map((task) => task.promptId)).toEqual(['p-me', 'r-me', 'h-me']);
  });

  it('ほかの実行は、実行中と待機の数だけを数える（送り元の分からないものも含む）', () => {
    expect(otherRuns(running, pending, ['me', 'old'])).toEqual({ running: 1, pending: 1 });
  });
});
