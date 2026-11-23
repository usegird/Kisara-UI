import type { MissingModel, WorkflowModel } from '@/graph/missing-models';
import { compareCardNumbers, type NodeView } from '@/graph/rows';
import { deepCardOf, innerCardOf } from '@/graph/subgraph-display';
import type { OuterField } from '@/graph/subgraph-values';
import { cardIdOfPromptNode, type ApiPromptDiagnostic } from '@/graph/to-api-prompt';
import type { NodeDefinitionMap, NodeId, Workflow } from '@/graph/types';
import { t } from '@/i18n';
import type { HistoryEntry } from '@/port/history';
import { formatRunError } from '@/queue/comfy-failure-text';
import type { FailureGuide } from '@/queue/connection-guide';
import type { ExecutionError } from '@/queue/execution-state';
import { runningNodeLabel, type RunningNodeLabel } from '@/queue/running-node';

export interface RunRejection {
  readonly reason: string;
  readonly nodes: Readonly<Record<string, readonly string[]>>;
  readonly inputs?: Readonly<Record<string, readonly (string | null)[]>> | undefined;
}

export type ReportTone = 'error' | 'warning' | 'muted';

export interface ReportLine {
  readonly tone: ReportTone;
  readonly text: string;
  readonly steps?: readonly string[] | undefined;
  readonly model?: WorkflowModel | undefined;
}

interface NodeReport {
  readonly key: string;
  readonly index: string | null;
  readonly cardId: NodeId | null;
  readonly name: string;
  readonly lines: readonly ReportLine[];
}

export interface RunReport {
  readonly general: readonly ReportLine[];
  readonly nodes: readonly NodeReport[];
  readonly errors: number;
  readonly warnings: number;
  readonly total: number;
}

interface MissingDefinition {
  readonly nodeId: NodeId;
  readonly classType: string;
  readonly disabled?: boolean | undefined;
}

interface OtherWriterNotice {
  readonly kind: 'restored' | 'parallel';
  readonly name: string;
  readonly time: string | null;
}

export interface RunReportInput {
  readonly missing: readonly MissingDefinition[];
  readonly missingModels?: readonly MissingModel[] | undefined;
  readonly namedModels?: readonly WorkflowModel[] | undefined;
  readonly diagnostics: readonly ApiPromptDiagnostic[];
  readonly rejection: RunRejection | null;
  readonly forbidden: FailureGuide | null;
  readonly error: ExecutionError | null;
  readonly unknown: boolean;
  readonly saveNotices?: readonly OtherWriterNotice[] | undefined;
  readonly folderFixes?:
    readonly { readonly promptNodeId: string; readonly to: string }[] | undefined;
}

function addRejectedLines(
  input: RunReportInput,
  rejection: RunRejection,
  add: (promptNodeId: string, line: ReportLine) => void,
  outerFieldFor: OuterFieldFor | undefined,
): void {
  for (const [nodeId, messages] of Object.entries(rejection.nodes)) {
    const inputNames = rejection.inputs?.[nodeId] ?? [];
    messages.forEach((message, at) => {
      const model = rejectedModelOf(input, nodeId, message);
      const inputName = inputNames[at] ?? null;
      const field = inputName === null ? null : (outerFieldFor?.(nodeId, inputName) ?? null);
      if (field === null) {
        add(nodeId, { tone: 'error', text: message, model });
        return;
      }
      const text = t('run.report.fieldLine', { field: field.label, text: message });
      add(field.promptNodeId, { tone: 'error', text, model });
    });
  }
}

function addFailureLines(
  input: RunReportInput,
  general: ReportLine[],
  add: (promptNodeId: string, line: ReportLine) => void,
  outerFieldFor: OuterFieldFor | undefined,
): void {
  if (input.forbidden !== null) {
    general.push({ tone: 'error', text: input.forbidden.summary, steps: input.forbidden.steps });
    return;
  }
  if (input.rejection !== null) {
    general.push({
      tone: 'error',
      text: t('run.report.rejected', { reason: input.rejection.reason }),
    });
    addRejectedLines(input, input.rejection, add, outerFieldFor);
    return;
  }
  if (input.error === null) return;
  const line: ReportLine = {
    tone: input.unknown ? 'muted' : 'error',
    text: input.error.message,
  };
  if (input.error.node === null) general.push(line);
  else add(input.error.node, line);
}

function missingLine(entry: MissingDefinition): ReportLine {
  if (entry.disabled === true) {
    return {
      tone: 'warning',
      text: t('run.report.missingDefinitionDisabled', { classType: entry.classType }),
    };
  }
  return { tone: 'error', text: t('run.report.missingDefinition', { classType: entry.classType }) };
}

function missingModelLine(model: MissingModel): ReportLine {
  const tone = model.disabled ? 'warning' : 'error';
  if (model.elsewhere !== null) {
    return {
      tone,
      text: t('run.report.modelElsewhere', { name: model.selected, actual: model.elsewhere }),
    };
  }
  return { tone, text: t('run.report.missingModel', { name: model.name }), model };
}

function rejectedModelOf(
  input: RunReportInput,
  promptNodeId: string,
  message: string,
): WorkflowModel | undefined {
  const reported = (input.missingModels ?? []).some((model) => model.promptNodeId === promptNodeId);
  if (reported) return undefined;
  return (input.namedModels ?? []).find(
    (model) => model.promptNodeId === promptNodeId && message.includes(model.selected),
  );
}

export type OuterFieldFor = (promptNodeId: string, inputName: string) => OuterField | null;

export interface ReportHeading extends RunningNodeLabel {
  readonly cardId: NodeId | null;
}

export function innerHeadingOf(
  views: readonly NodeView[],
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  promptNodeId: string,
): ReportHeading | null {
  const inner = innerCardOf(workflow, promptNodeId);
  if (inner === null) return deepHeadingOf(views, workflow, definitions, promptNodeId);
  const shown = views.find((view) => view.id === inner.scopedId);
  if (shown !== undefined) {
    const name = shown.comment.length > 0 ? shown.comment : shown.displayName;
    return { index: shown.index, name, cardId: shown.id };
  }
  const outer = views.find((view) => view.id === inner.instanceId);
  const { node } = inner;
  const title = typeof node.title === 'string' ? node.title : '';
  return {
    index: outer?.index == null ? null : `${outer.index}.${String(inner.number)}`,
    name: title.length > 0 ? title : (definitions.get(node.type)?.displayName ?? node.type),
    cardId: outer === undefined ? null : outer.id,
  };
}

function deepHeadingOf(
  views: readonly NodeView[],
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  promptNodeId: string,
): ReportHeading | null {
  const deep = deepCardOf(workflow, promptNodeId);
  const outer = deep === null ? undefined : views.find((view) => view.id === deep.instanceId);
  if (deep === null || outer === undefined) return null;
  const { node } = deep;
  const title = typeof node.title === 'string' ? node.title : '';
  return {
    index: outer.index === null ? null : [outer.index, ...deep.numbers.map(String)].join('.'),
    name: title.length > 0 ? title : (definitions.get(node.type)?.displayName ?? node.type),
    cardId: outer.id,
  };
}

export function buildRunReport(
  input: RunReportInput,
  views: readonly NodeView[],
  innerHeadingFor: (promptNodeId: string) => ReportHeading | null = () => null,
  outerFieldFor?: OuterFieldFor,
): RunReport {
  const general: ReportLine[] = [];
  const byNode = new Map<
    string,
    { index: string | null; cardId: NodeId | null; name: string; lines: ReportLine[] }
  >();

  const add = (promptNodeId: string, line: ReportLine): void => {
    const innerHeading = promptNodeId.includes(':') ? innerHeadingFor(promptNodeId) : null;
    const cardId = cardIdOfPromptNode(promptNodeId);
    let key = cardId === null ? promptNodeId : String(cardId);
    if (innerHeading !== null) key = promptNodeId;
    const { text } = line;

    const entry = byNode.get(key);
    if (entry) {
      entry.lines.push({ ...line, text });
      return;
    }
    const label =
      innerHeading ?? runningNodeLabel(views, cardId === null ? promptNodeId : String(cardId));
    byNode.set(key, {
      index: label?.index ?? null,
      cardId: innerHeading === null ? cardId : innerHeading.cardId,
      name: label?.name ?? `#${promptNodeId}`,
      lines: [{ ...line, text }],
    });
  };

  addFailureLines(input, general, add, outerFieldFor);

  const missingIds = new Set(input.missing.map((entry) => String(entry.nodeId)));
  for (const entry of input.missing) add(String(entry.nodeId), missingLine(entry));

  for (const model of input.missingModels ?? []) add(model.promptNodeId, missingModelLine(model));

  for (const fix of input.folderFixes ?? []) {
    add(fix.promptNodeId, {
      tone: 'warning',
      text: t('run.report.movedToFolder', { path: fix.to }),
    });
  }

  for (const diagnostic of input.diagnostics) {
    if (diagnostic.code === 'unknown-class' && missingIds.has(diagnostic.nodeId)) continue;
    add(diagnostic.nodeId, { tone: 'warning', text: diagnostic.message });
  }

  for (const notice of input.saveNotices ?? []) {
    const values = {
      name: notice.name.length === 0 ? t('run.report.untitledTab') : notice.name,
      time: notice.time ?? '—',
    };
    general.push({
      tone: 'warning',
      text:
        notice.kind === 'parallel'
          ? t('run.report.parallelEdit', values)
          : t('run.report.otherWriter', values),
    });
  }

  const nodes = [...byNode.entries()]
    .map(([key, entry]) => ({ key, ...entry }))
    .sort((a, b) => compareCardNumbers(a.index, b.index));

  const lines = [...general, ...nodes.flatMap((node) => node.lines)];
  return {
    general,
    nodes,
    errors: lines.filter((line) => line.tone === 'error').length,
    warnings: lines.filter((line) => line.tone === 'warning').length,
    total: lines.length,
  };
}

export function reportLineKey(nodeKey: string | null, line: ReportLine): string {
  return `${nodeKey ?? ''}\n${line.tone}\n${line.text}`;
}

export function withoutDismissed(report: RunReport, dismissed: ReadonlySet<string>): RunReport {
  if (dismissed.size === 0) return report;
  const general = report.general.filter((line) => !dismissed.has(reportLineKey(null, line)));
  const nodes = report.nodes
    .map((node) => ({
      ...node,
      lines: node.lines.filter((line) => !dismissed.has(reportLineKey(node.key, line))),
    }))
    .filter((node) => node.lines.length > 0);
  const lines = [...general, ...nodes.flatMap((node) => node.lines)];
  return {
    general,
    nodes,
    errors: lines.filter((line) => line.tone === 'error').length,
    warnings: lines.filter((line) => line.tone === 'warning').length,
    total: lines.length,
  };
}

export function lastRunFailureOf(
  history: readonly HistoryEntry[],
  session: string | null,
): ExecutionError | null {
  if (session === null) return null;
  let last: HistoryEntry | null = null;
  for (const entry of history) {
    if (entry.session !== session || entry.number === null) continue;
    if (last === null || last.number === null || entry.number > last.number) last = entry;
  }
  if (last?.error?.kind !== 'error') return null;
  return { node: last.error.nodeId, message: formatRunError(last.error.line) };
}

export function reportAlert(report: RunReport): 'error' | 'warning' | 'none' {
  if (report.errors > 0) return 'error';
  return report.warnings > 0 ? 'warning' : 'none';
}
