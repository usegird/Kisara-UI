import { beforeEach, describe, expect, it } from 'vitest';

import type { ComfyEvent } from '@/port/run';
import {
  RECONCILE_GRACE_MS,
  reconcileExecution,
  reduceExecution,
  timeoutMessage,
  type QueuePresence,
} from '@/queue/execution';
import { INITIAL_EXECUTION, type ExecutionSnapshot } from '@/queue/execution-state';
import { useExecutionStore } from '@/store/use-execution-store';

const RUNNING: ExecutionSnapshot = { ...INITIAL_EXECUTION, status: 'queued', promptId: 'p1' };

function apply(state: ExecutionSnapshot, ...events: ComfyEvent[]): ExecutionSnapshot {
  return events.reduce(reduceExecution, state);
}

beforeEach(() => {
  useExecutionStore.getState().reset();
});

describe('実行状態の反映', () => {
  it('開始から完了までを追う', () => {
    const done = apply(
      RUNNING,
      { type: 'execution_start', promptId: 'p1' },
      { type: 'executing', promptId: 'p1', node: '12', displayNode: '12' },
      { type: 'progress', promptId: 'p1', node: '12', value: 5, max: 20 },
      { type: 'executing', promptId: 'p1', node: null, displayNode: null },
    );

    expect(done.status).toBe('done');
    expect(done.runningNode).toBeNull();
    expect(done.progress).toBeNull();
  });

  it('進捗と実行中ノードを保持する', () => {
    const state = apply(RUNNING, {
      type: 'progress',
      promptId: 'p1',
      node: '68:25',
      value: 3,
      max: 8,
    });

    expect(state.status).toBe('running');
    expect(state.progress).toEqual({ value: 3, max: 8 });
    expect(state.runningNode).toBe('68:25');
  });

  it('出力をノードごとに溜める', () => {
    const state = apply(
      RUNNING,
      { type: 'executed', promptId: 'p1', node: '9', files: [] },
      {
        type: 'executed',
        promptId: 'p1',
        node: '60',
        files: [{ filename: 'a.png', subfolder: '', type: 'output' }],
      },
    );

    expect(Object.keys(state.outputsById.p1 ?? {})).toEqual(['9', '60']);
  });

  it('次の実行へ移っても、前の実行の出力は id ごとに残す', () => {
    const file = { filename: 'a.png', subfolder: '', type: 'output' };
    const executed: ComfyEvent = { type: 'executed', promptId: 'p1', node: '9', files: [file] };
    // 続けて投げた実行が始まった（通知）
    const queued = { ...RUNNING, submittedIds: ['p1', 'p2'] };
    const switched = apply(queued, executed, { type: 'execution_start', promptId: 'p2' });
    // 今の実行は p2 に移るが、p1 の出力は id ごとに残る
    expect([switched.promptId, switched.outputsById.p1]).toEqual(['p2', { 9: [file] }]);

    // 終わった後に次を投げた（受理）
    useExecutionStore.setState(
      apply(RUNNING, executed, { type: 'execution_success', promptId: 'p1' }),
    );
    useExecutionStore.getState().start('p2');
    expect(useExecutionStore.getState().outputsById.p1).toEqual({ 9: [file] });
  });

  it('投げる前の片付けは状況を消すが、前の実行の出力は残す', () => {
    const file = { filename: 'a.png', subfolder: '', type: 'temp' };
    useExecutionStore.setState(
      apply(
        RUNNING,
        { type: 'executed', promptId: 'p1', node: '9', files: [file] },
        { type: 'execution_success', promptId: 'p1' },
      ),
    );

    useExecutionStore.getState().clearForSubmit();
    const state = useExecutionStore.getState();
    expect([state.status, state.promptId]).toEqual(['idle', null]);
    expect(state.outputsById.p1).toEqual({ 9: [file] });
  });

  it('エラーはノードとメッセージを残す', () => {
    const state = apply(RUNNING, {
      type: 'execution_error',
      promptId: 'p1',
      node: '68:13',
      message: 'CUDA out of memory',
    });

    expect(state.status).toBe('failed');
    expect(state.error).toEqual({ node: '68:13', message: 'CUDA out of memory' });
  });

  it('別の prompt の通知は無視する', () => {
    const state = apply(RUNNING, {
      type: 'executing',
      promptId: 'other',
      node: '1',
      displayNode: '1',
    });
    expect(state).toBe(RUNNING);
  });

  it('キュー残数は prompt に関係なく反映する', () => {
    expect(apply(RUNNING, { type: 'status', queueRemaining: 4 }).queueRemaining).toBe(4);
  });

  it('未知のイベントは状態を変えない', () => {
    expect(apply(RUNNING, { type: 'unknown', rawType: 'progress_state' })).toBe(RUNNING);
  });

  it('execution_success を正式な完了として扱う', () => {
    const state = apply(
      RUNNING,
      { type: 'executing', promptId: 'p1', node: '12', displayNode: '12' },
      { type: 'execution_success', promptId: 'p1' },
    );

    expect(state.status).toBe('done');
    expect(state.runningNode).toBeNull();
  });

  it('中断は完了扱いだが印を残す', () => {
    const state = apply(RUNNING, {
      type: 'execution_interrupted',
      promptId: 'p1',
      node: '12',
    });

    expect(state.status).toBe('done');
    expect(state.interrupted).toBe(true);
  });

  it('progress_state から進捗とノード状態を取り出す（現行の進捗通知）', () => {
    const state = apply(RUNNING, {
      type: 'progress_state',
      promptId: 'p1',
      nodes: [
        { nodeId: '68:8', displayNodeId: '68:8', value: 0, max: 1, state: 'finished' },
        { nodeId: '68:13', displayNodeId: '68:13', value: 7, max: 20, state: 'running' },
      ],
    });

    expect(state.progress).toEqual({ value: 7, max: 20 });
    expect(state.runningNode).toBe('68:13');
    expect(state.nodeStates).toEqual({ '68:8': 'finished', '68:13': 'running' });
  });

  it('ストアは start で状態を作り直す', () => {
    useExecutionStore.getState().applyEvent({ type: 'status', queueRemaining: 9 });
    useExecutionStore.getState().start('p2');

    const state = useExecutionStore.getState();
    expect(state.status).toBe('queued');
    expect(state.promptId).toBe('p2');
    expect(state.queueRemaining).toBeNull();
  });

  it('次を投げても、終わった実行のノード時刻は消さない（詳細はタスクごとに引く）', () => {
    const store = useExecutionStore.getState();
    store.start('p1');
    store.applyEvent({ type: 'execution_start', promptId: 'p1' });
    store.applyEvent({ type: 'executing', promptId: 'p1', node: '3', displayNode: '3' });
    store.applyEvent({ type: 'executing', promptId: 'p1', node: null, displayNode: null });
    store.start('p2');

    const timings = useExecutionStore.getState().nodeTimingsById.p1;
    expect(timings?.map((timing) => timing.nodeId)).toEqual(['3']);
    expect(timings?.[0]?.endedAt).not.toBeNull();
  });

  it('キューが空になったら、完了通知を取りこぼしていても実行中を解く', () => {
    // WS が切れている間に終わった場合。ここで解かないと実行ボタンが押せないまま固まる
    const settled = apply({ ...RUNNING, status: 'running' }, { type: 'status', queueRemaining: 0 });

    expect(settled.status).toBe('done');
    expect(settled.progress).toBeNull();
  });

  it('実行中のノードがあるうちは解かない', () => {
    const state = apply(
      { ...RUNNING, status: 'running', runningNode: '12' },
      { type: 'status', queueRemaining: 0 },
    );

    expect(state.status).toBe('running');
  });

  it('キューが残っているうちは解かない', () => {
    const state = apply({ ...RUNNING, status: 'running' }, { type: 'status', queueRemaining: 2 });

    expect(state.status).toBe('running');
    expect(state.queueRemaining).toBe(2);
  });

  it('待機中の状態は触らない', () => {
    const state = apply(INITIAL_EXECUTION, { type: 'status', queueRemaining: 0 });

    expect(state.status).toBe('idle');
  });

  it('受理応答より先に届いた通知を、start が塗り潰さない', () => {
    // 検証エラーで即座に落ちると、`POST /prompt` の応答より先に通知が届くことがある。
    // ここで「キュー待ち」に戻すと、実行ボタンが押せないまま固まる
    const failed = apply(INITIAL_EXECUTION, {
      type: 'execution_error',
      promptId: 'p9',
      node: '3',
      message: 'checkpoint がありません',
    });
    expect(failed.observedPromptId).toBe('p9');

    useExecutionStore.setState(failed);
    useExecutionStore.getState().start('p9');

    const state = useExecutionStore.getState();
    expect(state.status).toBe('failed');
    expect(state.promptId).toBe('p9');
  });

  it('別の実行の受理では、いつもどおりキュー待ちから始める', () => {
    useExecutionStore.setState(
      apply(INITIAL_EXECUTION, {
        type: 'execution_error',
        promptId: 'p9',
        node: null,
        message: 'x',
      }),
    );
    useExecutionStore.getState().start('p10');

    expect(useExecutionStore.getState().status).toBe('queued');
  });

  it('中断すると、通知を待たずに実行状態を解く', () => {
    useExecutionStore.setState({ ...RUNNING, status: 'running', runningNode: '3' });
    useExecutionStore.getState().stop();

    const state = useExecutionStore.getState();
    expect(state.status).toBe('done');
    expect(state.runningNode).toBeNull();
    expect(state.interrupted).toBe(true);
  });

  it('走っていないときの中断は何も変えない', () => {
    useExecutionStore.setState({ ...INITIAL_EXECUTION, status: 'done' });
    useExecutionStore.getState().stop();

    expect(useExecutionStore.getState().interrupted).toBe(false);
  });

  it('実行したノードの順番と所要時間を刻む（履歴には残らないので自前で測る）', () => {
    let state = reduceExecution(
      RUNNING,
      { type: 'executing', promptId: 'p1', node: '3', displayNode: '3' },
      1_000,
    );
    state = reduceExecution(
      state,
      { type: 'executing', promptId: 'p1', node: '12', displayNode: '12' },
      2_500,
    );
    state = reduceExecution(state, { type: 'execution_success', promptId: 'p1' }, 5_000);

    expect(state.nodeTimingsById.p1).toEqual([
      { nodeId: '3', startedAt: 1_000, endedAt: 2_500 },
      { nodeId: '12', startedAt: 2_500, endedAt: 5_000 },
    ]);
  });

  it('同じノードの通知が続いても区間は増やさない', () => {
    let state = reduceExecution(
      RUNNING,
      { type: 'executing', promptId: 'p1', node: '3', displayNode: '3' },
      1_000,
    );
    state = reduceExecution(
      state,
      { type: 'progress', promptId: 'p1', node: '3', value: 5, max: 20 },
      1_500,
    );

    expect(state.nodeTimingsById.p1).toHaveLength(1);
  });

  it('実行中でもキューに足せる（走っている実行の表示は消さない）', () => {
    useExecutionStore.setState({ ...RUNNING, status: 'running', runningNode: '3' });
    useExecutionStore.getState().start('p2');

    const state = useExecutionStore.getState();
    expect(state.promptId).toBe('p1');
    expect(state.runningNode).toBe('3');
    expect(state.submittedIds).toContain('p2');
  });

  it('次の実行が始まったら表示を切り替える', () => {
    useExecutionStore.setState({
      ...RUNNING,
      status: 'running',
      runningNode: '3',
      submittedIds: ['p1', 'p2'],
      nodeTimingsById: { p1: [{ nodeId: '3', startedAt: 1, endedAt: 2 }] },
    });
    useExecutionStore.getState().applyEvent({ type: 'execution_start', promptId: 'p2' });

    const state = useExecutionStore.getState();
    expect(state.promptId).toBe('p2');
    expect(state.status).toBe('running');
    // 1つ前の進捗は引きずらない
    expect(state.runningNode).toBeNull();
    expect(state.nodeTimingsById.p2 ?? []).toEqual([]);
    // ただし**前の実行の記録は消さない**（詳細で見られるように）
    expect(state.nodeTimingsById.p1).toHaveLength(1);
  });

  it('自分が投げていない実行の通知は無視する', () => {
    const state = apply(
      { ...RUNNING, status: 'running', submittedIds: ['p1'] },
      { type: 'execution_error', promptId: 'someone-else', node: null, message: 'x' },
    );

    expect(state.status).toBe('running');
    expect(state.error).toBeNull();
  });
});

// ─────────────────────────────
// サーバーとの突き合わせ。
// **通知を取りこぼしても実行中のまま固まらない**が、投げた直後には結論を出さない。
// ─────────────────────────────

describe('サーバーとの突き合わせ', () => {
  const inFlight: ExecutionSnapshot = {
    ...INITIAL_EXECUTION,
    status: 'running',
    promptId: 'p1',
    runningNode: '3',
    startedAt: 0,
  };
  const late = RECONCILE_GRACE_MS + 1;
  /** 投げた後に問い合わせた見え方 */
  const seen = (
    active: string[],
    finished: QueuePresence['finished'] = [],
    requestedAt = 1,
  ): QueuePresence => ({ active, finished, requestedAt });
  const NOWHERE = seen([]);

  it('キューに居る間はそのまま', () => {
    const state = reconcileExecution(inFlight, seen(['p1']), late);
    expect(state).toBe(inFlight);
  });

  it('投げた直後は結論を出さない（応答の行き違い）', () => {
    const state = reconcileExecution(
      { ...inFlight, startedAt: null, submittedAt: 0 },
      NOWHERE,
      RECONCILE_GRACE_MS - 1,
    );
    expect(state.status).toBe('running');
  });

  it('投げる前に問い合わせた見え方では決めない（遅れて返った古い応答）', () => {
    const submitted: ExecutionSnapshot = { ...inFlight, submittedAt: 100 };
    const once = reconcileExecution(submitted, seen([], [], 99), late + 100);
    const twice = reconcileExecution(once, seen([], [], 99), late + 100);
    expect(twice).toBe(submitted);
  });

  it('履歴に居れば、その結果に合わせる', () => {
    const done = reconcileExecution(inFlight, seen([], [{ promptId: 'p1', success: true }]), late);
    expect(done.status).toBe('done');
    expect(done.runningNode).toBeNull();
    expect(done.finishedAt).toBe(late);

    const failed = reconcileExecution(
      inFlight,
      seen([], [{ promptId: 'p1', success: false }]),
      late,
    );
    expect(failed.status).toBe('failed');
  });

  it('成否が取れない履歴は終わったものとして扱う', () => {
    const state = reconcileExecution(inFlight, seen([], [{ promptId: 'p1', success: null }]), late);
    expect(state.status).toBe('done');
  });

  it('続けて 2 回どこにも居なければ不明にする（1 回では決めない。成功に見せない）', () => {
    const once = reconcileExecution(inFlight, NOWHERE, late);
    expect(once.status).toBe('running');

    const state = reconcileExecution(once, NOWHERE, late);
    expect(state.status).toBe('unknown');
    expect(state.runningNode).toBeNull();
    expect(state.error?.message).not.toBe('');
  });

  it('間でキューに居たら、居なかった回数を数え直す', () => {
    const once = reconcileExecution(inFlight, NOWHERE, late);
    const back = reconcileExecution(once, seen(['p1']), late);
    expect(reconcileExecution(back, NOWHERE, late).status).toBe('running');
  });

  it('不明のものは、履歴に出たときだけその結果に置き換える', () => {
    const unknown: ExecutionSnapshot = { ...inFlight, status: 'unknown' };

    expect(reconcileExecution(unknown, seen(['p1']), late)).toBe(unknown);
    expect(reconcileExecution(unknown, NOWHERE, late)).toBe(unknown);
    const done = reconcileExecution(unknown, seen([], [{ promptId: 'p1', success: true }]), late);
    expect(done.status).toBe('done');
    expect(done.error).toBeNull();
    const failed = reconcileExecution(
      unknown,
      seen([], [{ promptId: 'p1', success: false }]),
      late,
    );
    expect(failed.status).toBe('failed');
  });

  it('通知を諦めたら、実行中・待機を不明にする。終わったものは触らない', () => {
    useExecutionStore.setState(inFlight);
    useExecutionStore.getState().markUnknown(timeoutMessage('drops'));
    expect(useExecutionStore.getState().status).toBe('unknown');
    expect(useExecutionStore.getState().error?.message).toBe(timeoutMessage('drops'));
    expect(timeoutMessage('drops')).not.toBe(timeoutMessage('retries'));

    useExecutionStore.setState({ ...inFlight, status: 'done', error: null });
    useExecutionStore.getState().markUnknown(timeoutMessage());
    expect(useExecutionStore.getState().status).toBe('done');
  });

  it('不明から実行中には戻さない。終わりの知らせだけが終わったへ進める', () => {
    const unknown: ExecutionSnapshot = { ...inFlight, status: 'unknown' };
    const progressed = apply(
      unknown,
      { type: 'execution_start', promptId: 'p1' },
      { type: 'executing', promptId: 'p1', node: '4', displayNode: '4' },
      { type: 'progress', promptId: 'p1', node: '4', value: 1, max: 2 },
    );
    expect(progressed.status).toBe('unknown');

    const done = apply(progressed, { type: 'execution_success', promptId: 'p1' });
    expect(done.status).toBe('done');
  });

  it('終わっている実行は触らない', () => {
    const done: ExecutionSnapshot = { ...inFlight, status: 'done' };
    expect(reconcileExecution(done, NOWHERE, late)).toBe(done);
  });

  it('ストアからも立て直せる', () => {
    useExecutionStore.setState(inFlight);
    useExecutionStore.getState().reconcile(seen(['p1']));
    expect(useExecutionStore.getState().status).toBe('running');
  });
});

describe('失敗したあとに届く通知', () => {
  const FAILED = apply(RUNNING, {
    type: 'execution_error',
    promptId: 'p1',
    node: '5',
    message: '落ちました',
  });

  it('進捗が来ても実行中に戻さない', () => {
    const after = apply(FAILED, {
      type: 'progress_state',
      promptId: 'p1',
      nodes: [{ nodeId: '5', displayNodeId: '5', value: 0, max: 1, state: 'error' }],
    });

    expect(after.status).toBe('failed');
    expect(after.error?.message).toBe('落ちました');
  });

  it('終了通知が来ても成功に塗り替えない', () => {
    const after = apply(
      FAILED,
      { type: 'executing', promptId: 'p1', node: null, displayNode: null },
      { type: 'execution_success', promptId: 'p1' },
    );

    expect(after.status).toBe('failed');
  });

  it('ノードの色だけは新しいものを映す', () => {
    const after = apply(FAILED, {
      type: 'progress_state',
      promptId: 'p1',
      nodes: [{ nodeId: '4', displayNodeId: '4', value: 1, max: 1, state: 'finished' }],
    });

    expect(after.nodeStates['4']).toBe('finished');
  });
});

describe('エラー状態のノード', () => {
  // `execution_error` を取りこぼしても「処理中」のまま残らないようにする
  it('進捗にエラーのノードが居れば失敗にする', () => {
    const after = apply(RUNNING, {
      type: 'progress_state',
      promptId: 'p1',
      nodes: [
        { nodeId: '4', displayNodeId: '4', value: 1, max: 1, state: 'finished' },
        { nodeId: '5', displayNodeId: '5', value: 0, max: 1, state: 'error' },
      ],
    });

    expect(after.status).toBe('failed');
    expect(after.error?.node).toBe('5');
    expect(after.runningNode).toBeNull();
  });

  it('あとから来た本当の理由で上書きする', () => {
    const after = apply(
      RUNNING,
      {
        type: 'progress_state',
        promptId: 'p1',
        nodes: [{ nodeId: '5', displayNodeId: '5', value: 0, max: 1, state: 'error' }],
      },
      { type: 'execution_error', promptId: 'p1', node: '5', message: 'CUDA out of memory' },
    );

    expect(after.error?.message).toBe('CUDA out of memory');
  });
});
