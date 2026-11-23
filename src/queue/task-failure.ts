import { cardIdOfPromptNode } from '@/graph/to-api-prompt';
import { t } from '@/i18n';
import type { PromptNode, RunFailure } from '@/port/run';
import type { NodeTiming } from '@/queue/execution-state';
import { linkedNodeId } from '@/queue/task-detail';
import type { SubmitFailure } from '@/queue/task-log';

interface FailureStep {
  readonly nodeId: string;
  readonly classType: string | null;
}

interface FailureTrace {
  readonly steps: readonly FailureStep[];
  readonly orderedBy: 'observed' | 'dependency';
  readonly cached: readonly FailureStep[];
  readonly notRun: number;
}

function byNodeId(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function dependencyOrder(
  ids: readonly string[],
  nodes: ReadonlyMap<string, PromptNode>,
): string[] {
  const wanted = new Set(ids);
  const upstream = new Map<string, Set<string>>();
  for (const id of wanted) {
    const inputs = Object.values(nodes.get(id)?.inputs ?? {});
    const from = inputs.map(linkedNodeId).filter((up): up is string => up !== null);
    upstream.set(id, new Set(from.filter((up) => wanted.has(up) && up !== id)));
  }

  const order: string[] = [];
  const done = new Set<string>();
  while (done.size < wanted.size) {
    const ready = [...wanted]
      .filter((id) => !done.has(id) && [...(upstream.get(id) ?? [])].every((up) => done.has(up)))
      .sort(byNodeId);
    const next =
      ready.length > 0 ? ready : [...wanted].filter((id) => !done.has(id)).sort(byNodeId);
    for (const id of next) {
      done.add(id);
      order.push(id);
    }
  }
  return order;
}

export function failureTrace(
  failure: RunFailure,
  nodes: ReadonlyMap<string, PromptNode>,
  timings: readonly NodeTiming[],
): FailureTrace {
  const step = (nodeId: string): FailureStep => ({
    nodeId,
    classType: nodes.get(nodeId)?.classType ?? null,
  });
  const executed = failure.executed.filter((id) => id !== failure.nodeId);
  const known = new Set(executed);

  const seen = [...new Set(timings.map((timing) => timing.nodeId))].filter((id) => known.has(id));
  const seenSet = new Set(seen);
  const rest = dependencyOrder(
    executed.filter((id) => !seenSet.has(id)),
    nodes,
  );
  const cached = failure.cached.filter((id) => !known.has(id) && id !== failure.nodeId);
  const touched = new Set([...executed, ...cached, failure.nodeId ?? '']);

  return {
    steps: [...seen, ...rest].map(step),
    orderedBy: seen.length > 0 ? 'observed' : 'dependency',
    cached: [...cached].sort(byNodeId).map(step),
    notRun: [...nodes.keys()].filter((id) => !touched.has(id)).length,
  };
}

export type NodeLabeler = (promptNodeId: string, classType: string | null) => string;

export function nodeLabeler(labels: Readonly<Record<string, string>> | undefined): NodeLabeler {
  return (promptNodeId, classType) => {
    const cardId = cardIdOfPromptNode(promptNodeId);
    const label = cardId === null ? undefined : labels?.[String(cardId)];
    if (label === undefined) {
      return `#${promptNodeId} ${classType ?? t('queue.copyText.unknown')}`.trimEnd();
    }

    const at = promptNodeId.indexOf(':');
    return at < 0
      ? `#${label}`
      : t('queue.copyText.innerLabel', { label, id: promptNodeId.slice(at + 1) });
  };
}

export const PLAIN_LABELER: NodeLabeler = nodeLabeler(undefined);

export function formatTaskFailure(
  failure: RunFailure,
  trace: FailureTrace,
  label: NodeLabeler = PLAIN_LABELER,
): string {
  const stepText = (item: FailureStep): string => label(item.nodeId, item.classType);
  const heading = t(
    failure.kind === 'interrupted' ? 'queue.failure.interruptedNode' : 'queue.failure.stoppedNode',
  );
  const node = label(failure.nodeId ?? '?', failure.nodeType);
  const lines = [t('queue.copyText.headingLine', { heading, node })];

  if (failure.kind === 'error') {
    const type = failure.exceptionType ?? t('queue.copyText.unknown');
    lines.push('', t('queue.copyText.exception', { type }), failure.message ?? '');
  }

  const order = t(
    trace.orderedBy === 'observed'
      ? 'queue.failure.orderObserved'
      : 'queue.copyText.orderDependency',
  );
  lines.push('', t('queue.copyText.stepsHeading', { order }));
  trace.steps.forEach((item, index) => lines.push(`  ${String(index + 1)}. ${stepText(item)}`));
  if (trace.cached.length > 0) {
    lines.push(t('queue.copyText.cached', { nodes: trace.cached.map(stepText).join(', ') }));
  }
  lines.push(t('queue.copyText.notRun', { count: String(trace.notRun) }));

  if (failure.inputs.length > 0) {
    lines.push('', t('queue.copyText.inputs'));
    for (const input of failure.inputs) lines.push(`  ${input.name}: ${input.values.join(', ')}`);
  }
  if (failure.traceback.length > 0) {
    lines.push(
      '',
      t('queue.copyText.traceback'),
      ...failure.traceback.map((line) => line.trimEnd()),
    );
  }
  return lines.join('\n').trimEnd();
}

export function formatRejection(
  rejection: SubmitFailure,
  label: NodeLabeler = PLAIN_LABELER,
): string {
  const lines = [t('queue.copyText.rejection', { reason: rejection.reason })];
  for (const node of rejection.nodes) {
    lines.push('', label(node.nodeId, node.classType));
    for (const message of node.messages) lines.push(`  ${message}`);
  }
  return lines.join('\n');
}
