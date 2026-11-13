import { create } from 'zustand';

// ─────────────────────────────
// 繰り返し実行の並び（タブごとに 1 つ。選んだときのタブに結び付ける）。送りは `use-repeat-run` が持つ。
// 資源を使い続けるので端末には残さない（読み込み直したら止まっている）。
// ─────────────────────────────

/** 1 つのタブの繰り返し */
export interface RepeatJob {
  /** 対象のタブ（ワークフローの出どころ） */
  readonly tabId: string;
  /** 投げた回数（1 回目を投げたら 1） */
  readonly count: number;
  /** 今キューに置いている実行の id。投げている途中は null */
  readonly promptId: string | null;
  /** 続けて失敗した回数（正常に終われば 0 に戻す） */
  readonly failures: number;
  /** 最後に投げた時刻（ms）。次を投げるまでの最短の間隔を数える起点 */
  readonly sentAt: number;
}

/** 繰り返しの並びと、始める・進める・終える操作 */
interface RepeatState {
  /** 繰り返しの並び（始めた順。タブごとに 1 つ） */
  readonly jobs: readonly RepeatJob[];
  /** 始める。そのタブが最中なら何もしない（false を返す） */
  readonly begin: (tabId: string) => boolean;
  /** 投げた実行を覚え、回数を進める */
  readonly submitted: (tabId: string, promptId: string) => void;
  /**
   * 次を投げる前に今の実行を手放す（同じ実行から 2 回投げない）。
   * 失敗だったら続けて失敗した回数を進め、正常なら 0 に戻す
   */
  readonly release: (tabId: string, failed: boolean) => void;
  /** そのタブの繰り返しを終える */
  readonly stop: (tabId: string) => void;
}

/**
 * 今の実行の決着。`next` は正常に終わった・中断された、`failed` は実行中の失敗（どちらも次を投げる）。
 * 中断はそのタスクだけを止める操作なので、繰り返しは終えない
 */
type RepeatOutcome = 'pending' | 'next' | 'failed';

/** 繰り返しの 1 件が終わったかを決める材料 */
export interface RepeatSignals {
  /** 手元で見ている実行（通知から） */
  readonly execution: {
    readonly promptId: string | null;
    readonly status: string;
  };
  /** 実行の控え（履歴から）。成功なら true、失敗なら false、まだ無ければ null */
  readonly logged: boolean | null;
}

/**
 * 繰り返しの 1 件が終わったかを決める。通知で見ていなかった分は履歴の控えで決める
 * （控えは成否しか持たないので、見ていなかった中断は失敗と見分けられない）。
 * **不明の実行**（ComfyUI の再起動などで、キューにも履歴にも居ない・通知を諦めた）は結果が出ないので、
 * 待ち続けず失敗として数えて次へ進む（続けて失敗した回数の上限で止まる。切断扱いの間は次を送れず、
 * そこで終わる）。
 */
export function repeatOutcome(promptId: string, signals: RepeatSignals): RepeatOutcome {
  const { execution, logged } = signals;
  if (execution.promptId === promptId) {
    if (execution.status === 'failed' || execution.status === 'unknown') return 'failed';
    if (execution.status === 'done') return 'next';
  }
  if (logged === null) return 'pending';
  return logged ? 'next' : 'failed';
}

/** そのタブの繰り返しだけを書き換える（無ければ同じ並び） */
function updateJob(
  jobs: readonly RepeatJob[],
  tabId: string,
  change: (job: RepeatJob) => RepeatJob,
): readonly RepeatJob[] {
  return jobs.some((job) => job.tabId === tabId)
    ? jobs.map((job) => (job.tabId === tabId ? change(job) : job))
    : jobs;
}

export const useRepeatStore = create<RepeatState>()((set, get) => ({
  jobs: [],

  begin: (tabId) => {
    if (get().jobs.some((job) => job.tabId === tabId)) return false;
    set((state) => ({
      jobs: [...state.jobs, { tabId, count: 0, promptId: null, failures: 0, sentAt: 0 }],
    }));
    return true;
  },

  submitted: (tabId, promptId) =>
    set((state) => ({
      jobs: updateJob(state.jobs, tabId, (job) => ({
        ...job,
        promptId,
        count: job.count + 1,
        sentAt: Date.now(),
      })),
    })),

  release: (tabId, failed) =>
    set((state) => ({
      jobs: updateJob(state.jobs, tabId, (job) => ({
        ...job,
        promptId: null,
        failures: failed ? job.failures + 1 : 0,
      })),
    })),

  stop: (tabId) =>
    set((state) =>
      state.jobs.some((job) => job.tabId === tabId)
        ? { jobs: state.jobs.filter((job) => job.tabId !== tabId) }
        : state,
    ),
}));
