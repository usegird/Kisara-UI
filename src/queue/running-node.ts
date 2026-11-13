import type { NodeView } from '@/graph/rows';
import { cardIdOfPromptNode } from '@/graph/to-api-prompt';
import type { ProgressNodeState } from '@/port/run';

// ─────────────────────────────
// 実行中ノードの見せ方（実行バー・キュー列で共通）。
// WebSocket が返すのは**平坦化後の id**（subgraph 内なら `12:34`）なので、
// 先頭の区間でカードに戻して「通番 + ノード名」にする。
// ─────────────────────────────

/** 実行中ノードの表記（通し番号とノード名） */
export interface RunningNodeLabel {
  /** カードの通し番号。注記など番号を持たないものは null */
  readonly index: string | null;
  readonly name: string;
}

/** 通知のノード id から、カードの「通番 + ノード名」を引く。カードが無ければ id だけ */
export function runningNodeLabel(
  views: readonly NodeView[],
  promptNodeId: string | null,
): RunningNodeLabel | null {
  if (promptNodeId === null) return null;

  const cardId = cardIdOfPromptNode(promptNodeId);
  const view = cardId === null ? undefined : views.find((candidate) => candidate.id === cardId);
  // 定義が引けない・表示していないノードでも、id だけは出す（黙って消さない）
  if (!view) return { index: null, name: `#${promptNodeId}` };

  return {
    index: view.index,
    name: view.comment.length > 0 ? view.comment : view.displayName,
  };
}

/** ノードの進み具合。`progress_state` が知らせるノードの状態から数える */
export interface NodeProgress {
  readonly finished: number;
  readonly total: number;
}

/**
 * 終わったノード数と全体数。
 * **分母は投げた prompt のノード数**（`total`）で固定する。通知は届いた順に増えるので、
 * 届いた数を分母にすると途中で増えてしまう。飛ばされたノード（キャッシュ）は終わり扱い。
 */
export function nodeProgress(
  states: Readonly<Record<string, ProgressNodeState>>,
  cached: readonly string[] = [],
  total: number | null = null,
): NodeProgress | null {
  const done = new Set(cached);
  for (const [nodeId, state] of Object.entries(states)) {
    if (state === 'finished' || state === 'error') done.add(nodeId);
  }

  const reported = new Set([...Object.keys(states), ...cached]).size;
  if (reported === 0 && total === null) return null;

  return { finished: done.size, total: Math.max(total ?? 0, reported, done.size) };
}
