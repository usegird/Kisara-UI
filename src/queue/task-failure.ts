import { cardIdOfPromptNode } from '@/graph/to-api-prompt';
import { t } from '@/i18n';
import type { PromptNode, RunFailure } from '@/port/run';
import type { NodeTiming } from '@/queue/execution-state';
import { linkedNodeId } from '@/queue/task-detail';
import type { SubmitFailure } from '@/queue/task-log';

// ─────────────────────────────
// 失敗したときの「そこまでの処理」とノードの表記。履歴の `executed` は集合で順が無いので、この画面が
// 見た実行なら通知の順、それ以外は線のつながりから依存の順を求める。
// ─────────────────────────────

/** そこまでの処理の 1 つ（動いたノード） */
interface FailureStep {
  readonly nodeId: string;
  readonly classType: string | null;
}

/** 失敗したときの、動いたノードの並びと止まったノード */
interface FailureTrace {
  /** 動いたノード（止まったノードは含めない） */
  readonly steps: readonly FailureStep[];
  /** 並びの根拠。`observed` は通知の順、`dependency` は線のつながりから求めた順 */
  readonly orderedBy: 'observed' | 'dependency';
  readonly cached: readonly FailureStep[];
  /** 動かなかったノードの数 */
  readonly notRun: number;
}

function byNodeId(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** 線のつながりから求めた順（上流が先。同じ段は id の順）。含めるのは `ids` だけ */
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
    // 輪になっていたら残りを id の順に出す（止まらないように）
    const next =
      ready.length > 0 ? ready : [...wanted].filter((id) => !done.has(id)).sort(byNodeId);
    for (const id of next) {
      done.add(id);
      order.push(id);
    }
  }
  return order;
}

/** 失敗した実行の、止まるまでに動いたノードを順に並べる */
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

  // 通知で見ていたものを先に、見ていなかったものを依存の順で後ろへ
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

/** 実行のノード id（`12` / `12:34`）とクラス名から、画面に出す表記を返す */
export type NodeLabeler = (promptNodeId: string, classType: string | null) => string;

/** 控えた表記から引く表記の関数を作る。控えに無ければクラス名と id で表す */
export function nodeLabeler(labels: Readonly<Record<string, string>> | undefined): NodeLabeler {
  return (promptNodeId, classType) => {
    const cardId = cardIdOfPromptNode(promptNodeId);
    const label = cardId === null ? undefined : labels?.[String(cardId)];
    if (label === undefined) {
      return `#${promptNodeId} ${classType ?? t('queue.copyText.unknown')}`.trimEnd();
    }

    // 番号には # を付ける（控えは「番号 名前」の形で持つ）。
    // subgraph の中は外側のカードの表記に内側の id を添える
    const at = promptNodeId.indexOf(':');
    return at < 0
      ? `#${label}`
      : t('queue.copyText.innerLabel', { label, id: promptNodeId.slice(at + 1) });
  };
}

/** 表記の控えが無いとき（別の画面から投げたタスク） */
export const PLAIN_LABELER: NodeLabeler = nodeLabeler(undefined);

/** 写し取り用の 1 つの文字。報告や調べものに貼る */
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

/** 断られたタスクの写し取り用の文字 */
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
