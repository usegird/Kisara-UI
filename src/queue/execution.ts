import { t } from '@/i18n';
import { setOwn } from '@/lib/own-key';
import type { SocketGiveUp } from '@/port/connection';
import type { OutputFileRef } from '@/port/files';
import type { ComfyEvent } from '@/port/run';
import { formatRunError } from '@/queue/comfy-failure-text';
import {
  isPastRunning,
  isSettled,
  type ExecutionSnapshot,
  type NodeTiming,
  type RunOutputs,
} from '@/queue/execution-state';
import { RECONNECT_ATTEMPTS, RUN_DROP_LIMIT } from '@/queue/reconnect-policy';

// ─────────────────────────────
// 実行の状況（純関数）。通知の反映 `reduceExecution` と、キュー・履歴との突き合わせ
// `reconcileExecution` をここに置き、ストアは呼ぶだけにする。
// ─────────────────────────────

/**
 * 自分が投げたのではない実行の通知は無視する。
 * **自分が投げた別の実行**（キューに複数入れた場合）は無視せず、
 * `execution_start` で表示を切り替える。
 */
function isOtherPrompt(state: ExecutionSnapshot, promptId: string | null): boolean {
  if (promptId === null) return false;
  if (state.submittedIds.length > 0) return !state.submittedIds.includes(promptId);

  return state.promptId !== null && promptId !== state.promptId;
}

/** ノードがエラー状態で届いたときの理由。詳しい内容は `execution_error` で上書きされる */
function nodeErrorMessage(): string {
  return t('run.execution.nodeError');
}

/** 表示対象を次の実行へ切り替える（1つ前の進捗を引きずらない） */
function switchTo(state: ExecutionSnapshot, promptId: string, now: number): ExecutionSnapshot {
  return {
    ...state,
    promptId,
    status: 'running',
    runningNode: null,
    progress: null,
    cachedNodes: [],
    nodeStates: {},
    interrupted: false,
    error: null,
    startedAt: now,
    finishedAt: null,
    absences: 0,
  };
}

/** その実行の出力に 1 ノード分を足す（覚えておく数は実行のノード時刻と同じ） */
function withOutput(
  state: ExecutionSnapshot,
  promptId: string,
  node: string,
  files: readonly OutputFileRef[],
): Readonly<Record<string, RunOutputs>> {
  const run = { ...state.outputsById[promptId], [node]: files };
  const entries = Object.entries({ ...state.outputsById, [promptId]: run });
  return Object.fromEntries(entries.slice(-TIMING_MEMORY));
}

/** 未確定の間に届いた通知の prompt id を覚える（`start()` の取り違え防止） */
function observe(state: ExecutionSnapshot, event: ComfyEvent): ExecutionSnapshot {
  if (state.promptId !== null || event.type === 'status' || event.type === 'unknown') return state;
  if (event.promptId === null || event.promptId === state.observedPromptId) return state;

  return { ...state, observedPromptId: event.promptId };
}

/** 覚えておく実行の数（ノード時刻） */
const TIMING_MEMORY = 20;

/** 実行中ノードの切り替わりで区間を閉じ、新しい区間を開く */
function trackNode(
  timings: readonly NodeTiming[],
  nodeId: string | null,
  now: number,
): readonly NodeTiming[] {
  const open = timings.at(-1);
  if (open && open.endedAt === null) {
    if (open.nodeId === nodeId) return timings;

    const closed = [...timings.slice(0, -1), { ...open, endedAt: now }];
    return nodeId === null ? closed : [...closed, { nodeId, startedAt: now, endedAt: null }];
  }
  return nodeId === null ? timings : [...timings, { nodeId, startedAt: now, endedAt: null }];
}

/** いま表示している実行のノード時刻を書き換える（実行ごとに分けて持つ） */
function withTiming(
  state: ExecutionSnapshot,
  nodeId: string | null,
  now: number,
): Readonly<Record<string, readonly NodeTiming[]>> {
  const key = state.promptId;
  if (key === null) return state.nodeTimingsById;

  const next = trackNode(state.nodeTimingsById[key] ?? [], nodeId, now);
  const entries = Object.entries({ ...state.nodeTimingsById, [key]: next });

  return Object.fromEntries(entries.slice(-TIMING_MEMORY));
}

/** 通知 1 つを実行の状況に反映する */
export function reduceExecution(
  input: ExecutionSnapshot,
  event: ComfyEvent,
  now: number = Date.now(),
): ExecutionSnapshot {
  const state = observe(input, event);
  if (event.type === 'status') return onStatus(state, event);
  if (event.type === 'unknown') return state;
  if (isOtherPrompt(state, event.promptId)) return state;

  switch (event.type) {
    case 'execution_start':
      return onExecutionStart(state, event, now);

    case 'execution_cached':
      return { ...state, cachedNodes: event.nodes };

    case 'executing':
      return onExecuting(state, event, now);

    case 'execution_success':
      return finished(state, now);

    case 'execution_interrupted':
      return {
        ...state,
        status: 'done',
        interrupted: true,
        runningNode: null,
        progress: null,
      };

    case 'progress_state':
      return onProgressState(state, event, now);

    case 'progress':
      return onProgress(state, event);

    case 'executed':
      return onExecuted(state, event);

    case 'execution_error':
      return {
        ...state,
        status: 'failed',
        runningNode: null,
        progress: null,
        error: { node: event.node, message: formatRunError(event.message) },
        nodeTimingsById: withTiming(state, null, now),
      };
  }
}

/** 種別 `T` の通知 */
type EventOf<T extends ComfyEvent['type']> = Extract<ComfyEvent, { readonly type: T }>;

function onStatus(state: ExecutionSnapshot, event: EventOf<'status'>): ExecutionSnapshot {
  // キューが空になったのに実行中のままなら、完了通知を取りこぼしている
  // （WS の切断中に終わった等）。**実行ボタンが押せないまま固まるのを防ぐ**
  const idle =
    event.queueRemaining === 0 &&
    state.runningNode === null &&
    (state.status === 'running' || state.status === 'queued');

  return {
    ...state,
    queueRemaining: event.queueRemaining,
    status: idle ? 'done' : state.status,
    progress: idle ? null : state.progress,
  };
}

function onExecutionStart(
  state: ExecutionSnapshot,
  event: EventOf<'execution_start'>,
  now: number,
): ExecutionSnapshot {
  // 自分が投げた別の実行が始まったら、表示をそちらへ移す
  if (event.promptId !== null && event.promptId !== state.promptId) {
    return switchTo(state, event.promptId, now);
  }
  if (isPastRunning(state.status)) return state;
  return { ...state, status: 'running', error: null };
}

function onExecuting(
  state: ExecutionSnapshot,
  event: EventOf<'executing'>,
  now: number,
): ExecutionSnapshot {
  // node が null なら完了（正式な完了通知は execution_success。互換のため両方受ける）
  if (event.node === null) return finished(state, now);
  if (isPastRunning(state.status)) return state;
  return {
    ...state,
    status: 'running',
    runningNode: event.node,
    nodeTimingsById: withTiming(state, event.node, now),
  };
}

/** 実行が終わった。**失敗は上書きしない**（失敗は結論。エラーのあとにも終了通知は来る） */
function finished(state: ExecutionSnapshot, now: number): ExecutionSnapshot {
  return {
    ...state,
    status: state.status === 'failed' ? 'failed' : 'done',
    runningNode: null,
    progress: null,
    nodeTimingsById: withTiming(state, null, now),
  };
}

function onProgress(state: ExecutionSnapshot, event: EventOf<'progress'>): ExecutionSnapshot {
  if (isPastRunning(state.status)) return state;
  return {
    ...state,
    status: 'running',
    progress: { value: event.value, max: event.max },
    runningNode: event.node ?? state.runningNode,
  };
}

function onExecuted(state: ExecutionSnapshot, event: EventOf<'executed'>): ExecutionSnapshot {
  const id = event.promptId ?? state.promptId;
  if (event.node === null || id === null) return state;
  return { ...state, outputsById: withOutput(state, id, event.node, event.files) };
}

function onProgressState(
  state: ExecutionSnapshot,
  event: EventOf<'progress_state'>,
  now: number,
): ExecutionSnapshot {
  const nodeStates = { ...state.nodeStates };
  for (const node of event.nodes) setOwn(nodeStates, node.displayNodeId, node.state);

  // 決着が付いた実行には、ノードの色だけ反映して状況は触らない
  if (isSettled(state.status)) return { ...state, nodeStates };

  // **エラーのノードは失敗として扱う。** `execution_error` を取りこぼしても
  // 「処理中」のまま残らないようにする。詳しい理由は後から来る通知で上書きされる
  const failedNode = event.nodes.find((node) => node.state === 'error');
  if (failedNode) {
    return {
      ...state,
      status: 'failed',
      nodeStates,
      runningNode: null,
      progress: null,
      error: state.error ?? { node: failedNode.displayNodeId, message: nodeErrorMessage() },
      nodeTimingsById: withTiming(state, null, now),
    };
  }

  // 不明は失敗のノードでだけ終わったへ進める。進み具合では実行中に戻さない
  if (state.status === 'unknown') return { ...state, nodeStates };

  const running = event.nodes.find((node) => node.state === 'running');
  const current = running?.displayNodeId ?? state.runningNode;
  return {
    ...state,
    status: 'running',
    nodeStates,
    runningNode: current,
    progress: running ? { value: running.value, max: running.max } : state.progress,
    nodeTimingsById: withTiming(state, current, now),
  };
}

// ─────────────────────────────
// サーバーとの突き合わせ。通知が来ないことを完了と解釈しないが、実行中と見ているものがサーバーの
// どこにも居ないなら、そのままにもしない（見張り。通知を取りこぼすと実行中のまま固まる）。
// ─────────────────────────────

/** サーバー側に見えている実行（`GET /queue` と `GET /history` の射影） */
export interface QueuePresence {
  /** キューに居る実行 id（実行中・待機） */
  readonly active: readonly string[];
  /** 履歴に居る実行（成否。取れなければ null） */
  readonly finished: readonly { readonly promptId: string; readonly success: boolean | null }[];
  /** この見え方を問い合わせ始めた時刻（epoch ミリ秒）。投げる前に問い合わせた見え方では決めない */
  readonly requestedAt: number;
}

/** 投入から突き合わせを始めるまでの猶予。応答の行き違いで不明にしないため */
export const RECONCILE_GRACE_MS = 10_000;

/**
 * 続けて何回居なければ不明にするか
 */
const UNKNOWN_AFTER = 2;

function unknownMessage(): string {
  return t('run.execution.unknown');
}

/**
 * 通知の張り直しを諦めたとき（タイムアウト・切断扱い）の、実行に添える理由の文言
 */
export function timeoutMessage(reason: SocketGiveUp = 'retries'): string {
  return reason === 'drops'
    ? t('run.execution.dropped', { count: String(RUN_DROP_LIMIT) })
    : t('run.execution.timeout', { count: String(RECONNECT_ATTEMPTS) });
}

/**
 * サーバーの見え方に合わせて、実行中の状況を立て直す。
 *
 * - キューに居る → そのまま（進捗は通知が正）
 * - 履歴に居る → その結果に合わせる
 * - どこにも居ない → `UNKNOWN_AFTER` 回続いたら不明（`unknown`）。**成功にも失敗にもしない**
 *
 * 投げる前に問い合わせた見え方では決めない（遅れて返った古い応答で不明にしない）。
 * 不明のものは、**履歴に出たときだけ**その結果に置き換える（張り直したあとに分かる）。
 * キューに居ても実行中へは戻さない（前へしか進めない）。
 */
export function reconcileExecution(
  state: ExecutionSnapshot,
  presence: QueuePresence,
  now: number = Date.now(),
): ExecutionSnapshot {
  if (state.status === 'unknown') return settleUnknown(state, presence);
  if (state.status !== 'running' && state.status !== 'queued') return state;

  const id = state.promptId;
  if (id === null) return state;
  if (presence.active.includes(id)) return state.absences === 0 ? state : { ...state, absences: 0 };

  if (!canConclude(state, presence, now)) return state;

  const settled = { ...state, runningNode: null, progress: null, finishedAt: now, absences: 0 };
  const entry = presence.finished.find((item) => item.promptId === id);

  if (entry === undefined) {
    const absences = state.absences + 1;
    if (absences < UNKNOWN_AFTER) return { ...state, absences };
    return { ...settled, status: 'unknown', error: { node: null, message: unknownMessage() } };
  }
  return entry.success === false
    ? { ...settled, status: 'failed' }
    : { ...settled, status: 'done' };
}

/**
 * この見え方で結論を出してよいか。投げる前に問い合わせた見え方では決めず、投げた直後は
 * まだキューに出ないので急いで結論を出さない
 */
function canConclude(state: ExecutionSnapshot, presence: QueuePresence, now: number): boolean {
  const submitted = state.submittedAt ?? state.startedAt;
  if (submitted !== null && presence.requestedAt < submitted) return false;
  const since = state.startedAt ?? state.submittedAt;
  return since !== null && now - since >= RECONCILE_GRACE_MS;
}

function settleUnknown(state: ExecutionSnapshot, presence: QueuePresence): ExecutionSnapshot {
  const entry = presence.finished.find((item) => item.promptId === state.promptId);
  if (entry === undefined) return state;

  return entry.success === false
    ? { ...state, status: 'failed' }
    : { ...state, status: 'done', error: null };
}
