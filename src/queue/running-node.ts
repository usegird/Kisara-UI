import type { NodeView } from '@/graph/rows';
import { cardIdOfPromptNode } from '@/graph/to-api-prompt';
import type { ProgressNodeState } from '@/port/run';

export interface RunningNodeLabel {
  readonly index: string | null;
  readonly name: string;
}

export function runningNodeLabel(
  views: readonly NodeView[],
  promptNodeId: string | null,
): RunningNodeLabel | null {
  if (promptNodeId === null) return null;

  const cardId = cardIdOfPromptNode(promptNodeId);
  const view = cardId === null ? undefined : views.find((candidate) => candidate.id === cardId);
  if (!view) return { index: null, name: `#${promptNodeId}` };

  return {
    index: view.index,
    name: view.comment.length > 0 ? view.comment : view.displayName,
  };
}

export interface NodeProgress {
  readonly finished: number;
  readonly total: number;
}

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
