import type { ApiPrompt } from '@/graph/to-api-prompt';
import type { OutputFileRef } from '@/port/files';
import type { PromptNodeError } from '@/port/run';

// ─────────────────────────────
// 実行したタスクの控えの形と、控えの合わせ方（純関数）。持つのはストア（`use-task-log-store`）で、
// ここは形と規則だけ。
// ─────────────────────────────

/** 覚えておく件数（メモリだけなので、多すぎない範囲で） */
export const TASK_LOG_LIMIT = 500;

/** 実行したタスク 1 件の控え */
export interface TaskLogEntry {
  readonly promptId: string;
  readonly number: number | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly success: boolean | null;
  readonly outputs: readonly OutputFileRef[];
  /** この画面から投げた場合のワークフロー名 */
  readonly name: string | null;
  /** 失敗の 1 行の説明（履歴の 1 件が持つもの）。失敗の記録が無ければ null */
  readonly error?: string | null;
  /** `GET /history` の応答のうち、この実行の1件分そのもの。詳細はここから読む */
  readonly raw?: unknown;
  /** 投入を断られた（または送る前に落ちた）ときの理由。ComfyUI 側には残らない */
  readonly rejection?: SubmitFailure;
  /**
   * 投げた時点のカードの表記（カード id → 「通し番号 名前」）。この画面から投げたときだけある。
   * あとで並べ替えても、そのタスクの表記は変えない
   */
  readonly labels?: Readonly<Record<string, string>> | undefined;
  /** 実行の形に変えたときの注意（落とした・解決できなかったもの） */
  readonly notes?: readonly RunNote[] | undefined;
}

/** 実行の形に変えたときの注意 1 件 */
export interface RunNote {
  /** 平坦化後のノード id。ノードに結び付かなければ空 */
  readonly nodeId: string;
  readonly classType: string;
  readonly message: string;
}

/** 投げた時点に分かっていること。受理・拒否のどちらでも控える */
export interface SubmittedRun {
  readonly name: string | null;
  readonly labels: Readonly<Record<string, string>>;
  readonly notes: readonly RunNote[];
}

/** 投入を断られた理由（`POST /prompt` の 400 など） */
export interface SubmitFailure {
  /** 全体の理由 */
  readonly reason: string;
  /** ノードごとの理由。送る前に落ちたときは空 */
  readonly nodes: readonly PromptNodeError[];
  /** 別オリジンからの実行を断られた（ComfyUI の起動オプションで許可が要る） */
  readonly forbidden?: boolean;
}

/** 投入を断られた実行の控え */
export interface RejectedRun extends SubmittedRun {
  readonly failure: SubmitFailure;
  /** 送ろうとした実行の形。作る前に落ちたときは null */
  readonly prompt: ApiPrompt | null;
  readonly at: number;
}

/** 届いた控えを今の控えに重ね、新しい順に上限件数まで残す */
export function mergeTaskEntries(
  current: readonly TaskLogEntry[],
  incoming: readonly TaskLogEntry[],
): TaskLogEntry[] {
  const byId = new Map(current.map((entry) => [entry.promptId, entry]));

  for (const entry of incoming) {
    const previous = byId.get(entry.promptId);
    byId.set(entry.promptId, {
      ...previous,
      ...entry,
      // 名前と応答と表記は後から分からなくなるので、一度覚えたものを捨てない
      name: entry.name ?? previous?.name ?? null,
      raw: entry.raw ?? previous?.raw,
      labels: entry.labels ?? previous?.labels,
      notes: entry.notes ?? previous?.notes,
    });
  }

  return [...byId.values()]
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
    .slice(0, TASK_LOG_LIMIT);
}
