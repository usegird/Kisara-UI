import type { OutputFileRef } from '@/port/files';
import type { HistoryEntry, QueueEntry } from '@/port/history';
import { formatHistoryFailure } from '@/queue/comfy-failure-text';
import type { ExecutionProgress, ExecutionStatus, RunOutputs } from '@/queue/execution-state';
import { nodeLabeler, PLAIN_LABELER, type NodeLabeler } from '@/queue/task-failure';
import type { SubmitFailure, TaskLogEntry } from '@/queue/task-log';

// ─────────────────────────────
// キュー列に出す1件分を、通知・`GET /queue`・`GET /history`・端末の控えから組み立てる純関数。
// 取得も描画もしない。
// ─────────────────────────────

/**
 * タスクの状態。`unknown` は不明の実行（キューにも履歴にも居らず、結果が分からない）
 */
type QueueTaskState = 'running' | 'pending' | 'done' | 'failed' | 'unknown';

/** キュー列のカード 1 枚 */
export interface QueueTask {
  readonly promptId: string;
  readonly state: QueueTaskState;
  /** キュー番号（実行順）。取れなければ null */
  readonly number: number | null;
  readonly outputs: readonly OutputFileRef[];
  /** 実行中の進捗。無ければ null */
  readonly progress: { readonly value: number; readonly max: number } | null;
  /** 処理時間（ミリ秒）。実行中は経過時間。分からなければ null */
  readonly durationMs: number | null;
  /** 失敗の理由など。無ければ null */
  readonly message: string | null;
  /** 開始時刻（epoch ミリ秒）。分からなければ null */
  readonly startedAt: number | null;
  /**
   * 実行の記録から作ったときだけの完了時刻（epoch ミリ秒。接続先の時計）。これより後に書かれた
   * 同じ名前のファイルは出さない
   */
  readonly recordedEnd?: number | undefined;
}

/** この画面が投げた実行の途中経過（WebSocket 由来） */
export interface CurrentRun {
  readonly promptId: string | null;
  readonly status: ExecutionStatus;
  readonly progress: ExecutionProgress | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  /** 失敗の理由（受理されなかった場合を含む） */
  readonly error: string | null;
  /**
   * 実行 id → ノード id → 出力。実行中でも出た端から届く（`executed` イベント）。
   * 前に見ていた実行の分も残っている（キューの写しが古い間はここから出す）
   */
  readonly outputsById: Readonly<Record<string, RunOutputs>>;
}

/** サーバーのキューにも履歴にも出ない実行の id（受理される前に落ちた場合） */
export const LOCAL_TASK_ID = 'local';

/** キュー列を組み立てる材料 */
interface BuildQueueTasksInput {
  readonly running: readonly QueueEntry[];
  readonly pending: readonly QueueEntry[];
  readonly history: readonly HistoryEntry[];
  /**
   * 端末に控えてあるタスク。**サーバーの履歴は再起動で消える**ので、
   * 履歴から落ちたものはこちらで補う（画像はディスクに残っているので `/view` で引ける）。
   */
  readonly logged?: readonly TaskLogEntry[];
  readonly current: CurrentRun;
  /** 経過時間の基準（テストのために引数で受ける） */
  readonly now: number;
  /**
   * 通知が途切れているとき、キューに居るものへ添える一言。
   * `unknown` なら張り直しを諦めたので、実行中・待機を**不明**として出す
   */
  readonly stall?: TaskStall | null;
  /**
   * このブラウザのタブのセッション。渡せば、キューと履歴からは
   * **これらで送った実行だけ**を出す。省けば絞らない
   */
  readonly sessions?: readonly string[] | undefined;
}

/** そのセッションで送った実行か。送り元の分からないものは、ほかの実行として扱う */
function sentBy(
  entry: { readonly session: string | null },
  sessions: readonly string[] | undefined,
): boolean {
  return sessions === undefined || (entry.session !== null && sessions.includes(entry.session));
}

/** ほかのセッション・画面から送られた実行の数 */
export interface OtherRuns {
  readonly running: number;
  readonly pending: number;
}

/**
 * ほかのセッション・画面から送られて、実行中・待機している数
 */
export function otherRuns(
  running: readonly QueueEntry[],
  pending: readonly QueueEntry[],
  sessions: readonly string[],
): OtherRuns {
  return {
    running: running.filter((entry) => !sentBy(entry, sessions)).length,
    pending: pending.filter((entry) => !sentBy(entry, sessions)).length,
  };
}

/** 通知が途切れているときの一言と、諦めて不明にするか */
export interface TaskStall {
  readonly message: string;
  readonly unknown: boolean;
}

/**
 * 手元にある、見ていた実行の出力（通知から）。キューの写しが古い間・履歴に入る前は、
 * これで出す（出さないと、追従しているビューワーが前の画像へ戻る）
 */
function partialOutputs(current: CurrentRun, promptId: string): OutputFileRef[] {
  const outputs = current.outputsById[promptId];
  return outputs === undefined ? [] : Object.values(outputs).flat();
}

/** 手元に出力がある、終わった実行の id（新しい順）。今の実行は成功したときだけ */
function finishedRuns(current: CurrentRun): string[] {
  return Object.keys(current.outputsById)
    .reverse()
    .filter((id) => id !== current.promptId || current.status === 'done');
}

/** 控えのうち、結果か終了時刻が分かっているもの（列に出すもの） */
function knownLog(entry: TaskLogEntry): boolean {
  return entry.outputs.length > 0 || entry.finishedAt !== null;
}

/** 動いている間は経過時間、決着が付いていれば処理時間 */
function durationOf(
  startedAt: number | null,
  finishedAt: number | null,
  settled: boolean,
  now: number,
): number | null {
  if (startedAt === null) return null;

  const end = settled && finishedAt !== null ? finishedAt : now;
  return end - startedAt;
}

/** 組み立てる間の持ち物。`seen` は出した実行の id（同じものを 2 度出さない） */
interface BuildState {
  readonly current: CurrentRun;
  readonly now: number;
  readonly stall: TaskStall | null;
  /** 諦めたあとのキューの写しは古い。実行中・待機のままに見せない */
  readonly gone: boolean;
  readonly seen: Set<string>;
}

/**
 * キュー列のカードを組み立てる。並びは新しいものほど上（待機の新しい順 → 実行中 → 完了）で、
 * 実行中にキューへ足したものが一番上に出る。実行中の進捗・経過時間は通知から、待ち行列は
 * `GET /queue` から、終わったものは `GET /history` と端末の控えから作る
 */
export function buildQueueTasks(input: BuildQueueTasksInput): QueueTask[] {
  const { logged = [], current, now, stall = null, sessions } = input;
  const running = input.running.filter((entry) => sentBy(entry, sessions));
  const pending = input.pending.filter((entry) => sentBy(entry, sessions));
  const history = input.history.filter((entry) => sentBy(entry, sessions));
  const state: BuildState = { current, now, stall, gone: stall?.unknown === true, seen: new Set() };

  const local = localTask(state, [...running, ...pending]);
  const tasks: QueueTask[] = local === null ? [] : [local];

  // **後から足したものほど上**に出す（待機は番号の大きい順＝新しい順）
  for (const entry of [...pending].sort((a, b) => (b.number ?? 0) - (a.number ?? 0))) {
    if (!claim(state, entry.promptId)) continue;
    tasks.push(pendingTask(state, entry));
  }
  for (const entry of running) {
    if (!claim(state, entry.promptId)) continue;
    tasks.push(runningTask(state, entry));
  }

  // 終わった直後の自分の実行は、キューから抜けて履歴にまだ入っていない写しを取ることがある
  // （成功の通知は履歴へ移す前に届き、`/queue` と `/history` は別々に取る）。
  // 出さないと、次に取り直すまで画像が並びから抜ける
  // 控えのうち、投げた時点の何も分かっていないもの（下で出さないもの）は数えない
  const later = new Set([...history, ...logged.filter(knownLog)].map((entry) => entry.promptId));
  for (const promptId of finishedRuns(current)) {
    if (later.has(promptId) || !claim(state, promptId)) continue;
    tasks.push(finishedTask(current, promptId));
  }

  for (const entry of history) {
    // まだキューに居るものは、そちらの表示を優先する
    if (!claim(state, entry.promptId)) continue;
    tasks.push(historyTask(entry));
  }

  addLoggedTasks(state, logged, tasks);
  return tasks;
}

/** 履歴から消えたぶんを端末の控えで補う（結果ファイルはディスクに残っている） */
function addLoggedTasks(
  state: BuildState,
  logged: readonly TaskLogEntry[],
  tasks: QueueTask[],
): void {
  // 断られたタスクは、終わったタスクの間に時刻の順で差し込む（最後にまとめない）
  const rejected: QueueTask[] = [];
  for (const entry of logged) {
    if (state.seen.has(entry.promptId)) continue;
    // 結果も終了時刻も無いものは、まだ何も分かっていないので出さない
    if (!knownLog(entry)) continue;
    state.seen.add(entry.promptId);

    if (entry.rejection === undefined) tasks.push(loggedTask(entry));
    else rejected.push(rejectedTask(entry, entry.rejection));
  }
  for (const task of rejected) insertByTime(tasks, task);
}

/** まだ出していない実行なら出したことにして true。出していれば false */
function claim(state: BuildState, promptId: string): boolean {
  if (state.seen.has(promptId)) return false;
  state.seen.add(promptId);
  return true;
}

/**
 * **この画面が投げた実行**は、サーバーのキュー・履歴に出る前でも必ず先頭に出す。
 * 受理されずに落ちた実行（checkpoint 未選択など）はサーバー側に残らないので、
 * ここで出さないと「過去の完了」だけが並び、成功したように見えてしまう
 */
function localTask(state: BuildState, queued: readonly QueueEntry[]): QueueTask | null {
  const { current } = state;
  const onServer =
    current.promptId !== null && queued.some((entry) => entry.promptId === current.promptId);

  // 不明の実行（`unknown`）もここで出す。黙って消えると成功したように見える。
  // **受理される前に落ちたもの（id が無い失敗）は出さない**。控え（`logged`）に 1 回ごとに
  // 入っているので、ここで出すと同じものが 2 つになる
  const local =
    (current.status === 'failed' && current.promptId !== null) ||
    current.status === 'queued' ||
    current.status === 'unknown';
  if (onServer || !local) return null;

  const id = current.promptId ?? LOCAL_TASK_ID;
  state.seen.add(id);
  return {
    promptId: id,
    state: localState(current.status),
    number: null,
    outputs: [],
    progress: null,
    durationMs: spanMs(current.startedAt, current.finishedAt),
    message: current.error,
    startedAt: current.startedAt,
  };
}

function localState(status: ExecutionStatus): QueueTaskState {
  if (status === 'failed') return 'failed';
  if (status === 'unknown') return 'unknown';
  return 'pending';
}

function pendingTask(state: BuildState, entry: QueueEntry): QueueTask {
  return {
    promptId: entry.promptId,
    state: state.gone ? 'unknown' : 'pending',
    number: entry.number,
    outputs: [],
    progress: null,
    durationMs: null,
    message: state.gone ? (state.stall?.message ?? null) : null,
    startedAt: null,
  };
}

function runningTask(state: BuildState, entry: QueueEntry): QueueTask {
  const { current, stall } = state;
  // 途中経過は、この画面が投げた実行と同じ prompt のときだけ使う
  const mine = current.promptId === entry.promptId;
  const settled = settledState(state, mine);

  // **自分の実行でなくても時間を出す。** 出さないと、詰まって残ったものが
  // 「回っているだけの行」になり、止まっていることに気づけない。
  // 通知から得た開始時刻が無いときは、キューの投入時刻で代える
  const startedAt = (mine ? current.startedAt : null) ?? entry.createdAt;

  return {
    promptId: entry.promptId,
    state: settled ?? 'running',
    number: entry.number,
    outputs: partialOutputs(current, entry.promptId),
    progress: settled === null && mine ? current.progress : null,
    // 不明の他の実行は、いつ終わったか分からないので時間を出さない。
    // 張り直している間も出さない（通知が来ないので、時間だけ進んで見えてしまう）
    durationMs:
      (state.gone && !mine) || (stall !== null && settled === null)
        ? null
        : durationOf(startedAt, mine ? current.finishedAt : null, settled !== null, state.now),
    message: mine && settled !== null ? current.error : (stall?.message ?? null),
    startedAt,
  };
}

/**
 * **手元で決着が付いているものは実行中に見せない。** キューの写しは取り直すまで
 * 古いままなので、失敗を掴んでいてもその間は「処理中」に見えてしまう
 */
function settledState(state: BuildState, mine: boolean): 'failed' | 'unknown' | null {
  const { status } = state.current;
  if (mine && (status === 'failed' || status === 'unknown')) return status;
  return state.gone ? 'unknown' : null;
}

function finishedTask(current: CurrentRun, promptId: string): QueueTask {
  const isCurrent = promptId === current.promptId;
  return {
    promptId,
    state: 'done',
    number: null,
    outputs: partialOutputs(current, promptId),
    progress: null,
    durationMs: isCurrent ? spanMs(current.startedAt, current.finishedAt) : null,
    message: null,
    startedAt: isCurrent ? current.startedAt : null,
  };
}

function historyTask(entry: HistoryEntry): QueueTask {
  return {
    promptId: entry.promptId,
    state: entry.success === false ? 'failed' : 'done',
    // 完了したタスクも番号を残す（履歴の `prompt[0]`）
    number: entry.number,
    outputs: entry.outputs,
    progress: null,
    durationMs: spanMs(entry.startedAt, entry.finishedAt),
    message: formatHistoryFailure(entry.error),
    startedAt: entry.startedAt,
  };
}

function rejectedTask(entry: TaskLogEntry, rejection: SubmitFailure): QueueTask {
  return {
    promptId: entry.promptId,
    state: 'failed',
    number: null,
    outputs: [],
    progress: null,
    durationMs: null,
    message: formatSubmitRejection(rejection, nodeLabeler(entry.labels)),
    startedAt: entry.startedAt,
  };
}

function loggedTask(entry: TaskLogEntry): QueueTask {
  return {
    promptId: entry.promptId,
    state: entry.success === false ? 'failed' : 'done',
    number: entry.number,
    outputs: entry.outputs,
    progress: null,
    durationMs: spanMs(entry.startedAt, entry.finishedAt),
    message: entry.error ?? null,
    startedAt: entry.startedAt,
  };
}

/** 始まりと終わりの両方が分かっていれば、その間（ミリ秒） */
function spanMs(startedAt: number | null, finishedAt: number | null): number | null {
  return startedAt !== null && finishedAt !== null ? finishedAt - startedAt : null;
}

const SETTLED: ReadonlySet<QueueTaskState> = new Set(['done', 'failed', 'unknown']);

/** 終わったタスクのうち、自分より古い最初のものの手前に入れる。待機・実行中より上には出さない */
function insertByTime(tasks: QueueTask[], task: QueueTask): void {
  const at = tasks.findIndex(
    (other) => SETTLED.has(other.state) && (other.startedAt ?? 0) < (task.startedAt ?? 0),
  );
  if (at < 0) tasks.push(task);
  else tasks.splice(at, 0, task);
}

/** 断られたタスクのカードに出す 1 行。最初のノードの理由を優先し、無ければ全体の理由 */
function formatSubmitRejection(failure: SubmitFailure, label: NodeLabeler = PLAIN_LABELER): string {
  const [node] = failure.nodes;
  const first = node?.messages[0];
  if (node === undefined || first === undefined) return failure.reason;
  return `${label(node.nodeId, node.classType)}: ${first}`;
}

/**
 * 詳細の追従で移る先。最後に終わったもの。
 * 走り出した・待っているものには移らない（移るのはタスクが終わった時点）
 */
export function followTarget(tasks: readonly QueueTask[]): string | null {
  return tasks.find((task) => SETTLED.has(task.state))?.promptId ?? null;
}

/**
 * 隣のタスク。`direction` は `-1` が新しい方（並びは新しいものほど上）。
 * 端なら null。**id で引き直す**ので、並びが更新されていても迷子にならない。
 */
export function adjacentTask(
  tasks: readonly QueueTask[],
  promptId: string | null,
  direction: number,
): QueueTask | null {
  if (promptId === null) return null;

  const at = tasks.findIndex((task) => task.promptId === promptId);
  if (at < 0) return null;

  return tasks[at + direction] ?? null;
}

/** 進捗の割合（0〜1）。分からなければ null */
export function progressRatio(task: QueueTask): number | null {
  if (!task.progress || task.progress.max <= 0) return null;

  return Math.min(1, Math.max(0, task.progress.value / task.progress.max));
}
