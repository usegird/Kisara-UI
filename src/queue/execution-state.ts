import type { OutputFileRef } from '@/port/files';
import type { ProgressNodeState } from '@/port/run';

// ─────────────────────────────
// 実行の状況の形と初めの値・段階の判定。通知の反映と突き合わせは execution.ts。
// ─────────────────────────────

/**
 * 実行の状況。`unknown` は**不明**（キューにも履歴にも居ない・通知を諦めた。終わったかどうか分からない）。
 * 待機・実行中より後、終わった（`done`・`failed`）より前に置き、**前へしか進めない**
 */
export type ExecutionStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'unknown';

/** 実行中のノードの進捗（何ステップ中の何ステップ目か） */
export interface ExecutionProgress {
  readonly value: number;
  readonly max: number;
}

/** 実行の失敗。どのノードか（分からなければ null）と理由 */
export interface ExecutionError {
  readonly node: string | null;
  readonly message: string;
}

/**
 * ノード1つの処理時間。**履歴（`/history`）には残らない**ので、
 * この画面が WebSocket で見ていた実行についてだけ分かる。
 */
export interface NodeTiming {
  /** 平坦化後のノード id */
  readonly nodeId: string;
  readonly startedAt: number;
  /** 終了時刻。次のノードが始まるか、実行が終わると入る */
  readonly endedAt: number | null;
}

/** 手元で見ている実行の状況全体（ストアが持つ） */
export interface ExecutionSnapshot {
  readonly status: ExecutionStatus;
  readonly promptId: string | null;
  readonly queueRemaining: number | null;
  /** 実行中ノードの id（平坦化後の名前空間つき id） */
  readonly runningNode: string | null;
  readonly progress: ExecutionProgress | null;
  readonly cachedNodes: readonly string[];
  /**
   * 実行 id → ノード id → 出力ファイルの参照（取得はしない。見ていた実行のみ）。
   * **次の実行へ移っても前の分を消さない**。キューの写しを取り直すまでは、
   * 前の実行が実行中のまま残ったり、どこにも居なかったりするので、その間はここから出す
   */
  readonly outputsById: Readonly<Record<string, RunOutputs>>;
  /** ノード id → 進捗状態。カードの状態バリアント表示に使う */
  readonly nodeStates: Readonly<Record<string, ProgressNodeState>>;
  readonly interrupted: boolean;
  readonly error: ExecutionError | null;
  /** 実行が始まった・終わった時刻（epoch ミリ秒）。処理時間の表示に使う */
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  /**
   * 投入した時刻（epoch ミリ秒）。**突き合わせを急がない**ために持つ。
   * 投げた直後はサーバーのキューにまだ出ないので、居ないことを結論にできない。
   */
  readonly submittedAt: number | null;
  /**
   * `promptId` が未確定の間に届いた通知の prompt id。
   * **受理応答より先に通知が来ることがある**（検証エラーで即座に落ちる場合など）ので、
   * あとから `start()` されたときに「もう終わっている」ことを見分けるために覚えておく。
   */
  readonly observedPromptId: string | null;
  /**
   * 実行 id → 実行したノードの順番と所要時間（見ていた実行のみ）。
   * **キューに複数入れても、前の実行の分を消さない**。
   */
  readonly nodeTimingsById: Readonly<Record<string, readonly NodeTiming[]>>;
  /**
   * この画面から投げた実行の id（新しいものが末尾）。
   * 実行中でもキューに足せるので、複数を同時に抱えることがある。
   * 他の画面が投げた実行の通知を無視するためにも使う。
   */
  readonly submittedIds: readonly string[];
  /** 実行 id → 投げた prompt のノード数（進捗の分母。途中で増えないように固定する） */
  readonly totalNodesById: Readonly<Record<string, number>>;
  /**
   * 今の実行が、続けて何回の応答でキューにも履歴にも居なかったか。`UNKNOWN_AFTER` 回で不明にする
   * （1 回の行き違いで決めない）。居たら 0 に戻す
   */
  readonly absences: number;
}

export const INITIAL_EXECUTION: ExecutionSnapshot = {
  status: 'idle',
  promptId: null,
  queueRemaining: null,
  runningNode: null,
  progress: null,
  cachedNodes: [],
  outputsById: {},
  nodeStates: {},
  interrupted: false,
  error: null,
  startedAt: null,
  finishedAt: null,
  submittedAt: null,
  observedPromptId: null,
  nodeTimingsById: {},
  submittedIds: [],
  totalNodesById: {},
  absences: 0,
};

/**
 * 決着が付いた実行。**遅れて届いた進捗で実行中に戻さない。**
 * 戻すと、終わっているのに「処理中」のまま残り、失敗にも気づけない。
 */
export function isSettled(status: ExecutionStatus): boolean {
  return status === 'done' || status === 'failed';
}

/**
 * 進み具合で状態を変えない実行（決着した・不明）。**不明から待機・実行中には戻さない**
 * （前へしか進めない）。終わりの知らせ（成功・失敗・中断）だけが終わったへ進める
 */
export function isPastRunning(status: ExecutionStatus): boolean {
  return isSettled(status) || status === 'unknown';
}

/**
 * 今の実行の状況だけを消す。**実行 id ごとの記録（出力・ノード時刻・投げた id・分母）は残す**
 * （前の実行の詳細と画像は、次を投げた後も引く）
 */
export function clearRun(state: ExecutionSnapshot): ExecutionSnapshot {
  return {
    ...INITIAL_EXECUTION,
    outputsById: state.outputsById,
    nodeTimingsById: state.nodeTimingsById,
    submittedIds: state.submittedIds,
    totalNodesById: state.totalNodesById,
  };
}

/** 1 件の実行の出力。ノード id → ファイルの参照 */
export type RunOutputs = Readonly<Record<string, readonly OutputFileRef[]>>;

/**
 * 実行中・待機のものがあるか（手元の状況か、キューの写しに 1 件でも居る）。キューの見張りと、
 * 通知の口の切れを数えるかの判断が使う
 */
export function hasRunInFlight(status: ExecutionStatus, queued: number): boolean {
  return status === 'running' || status === 'queued' || queued > 0;
}
