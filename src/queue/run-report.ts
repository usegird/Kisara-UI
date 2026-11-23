import type { WorkflowModel } from '@/graph/missing-models';
import { compareCardNumbers, type NodeView } from '@/graph/rows';
import { cardIdOfPromptNode, type ApiPromptDiagnostic } from '@/graph/to-api-prompt';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import type { FailureGuide } from '@/queue/connection-guide';
import type { ExecutionError } from '@/queue/execution-state';
import { runningNodeLabel } from '@/queue/running-node';

export interface RunRejection {
  readonly reason: string;
  readonly nodes: Readonly<Record<string, readonly string[]>>;
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
  readonly missingModels?: readonly WorkflowModel[] | undefined;
  readonly diagnostics: readonly ApiPromptDiagnostic[];
  readonly rejection: RunRejection | null;
  readonly forbidden: FailureGuide | null;
  readonly error: ExecutionError | null;
  readonly unknown: boolean;
  readonly saveNotices?: readonly OtherWriterNotice[] | undefined;
}

function addFailureLines(
  input: RunReportInput,
  general: ReportLine[],
  add: (promptNodeId: string, line: ReportLine) => void,
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
    for (const [nodeId, messages] of Object.entries(input.rejection.nodes)) {
      for (const message of messages) add(nodeId, { tone: 'error', text: message });
    }
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

function innerIdOf(promptNodeId: string): string | null {
  const at = promptNodeId.indexOf(':');
  return at < 0 ? null : promptNodeId.slice(at + 1);
}

export function buildRunReport(input: RunReportInput, views: readonly NodeView[]): RunReport {
  const general: ReportLine[] = [];
  const byNode = new Map<string, { index: string | null; name: string; lines: ReportLine[] }>();

  const add = (promptNodeId: string, line: ReportLine): void => {
    const cardId = cardIdOfPromptNode(promptNodeId);
    const key = cardId === null ? promptNodeId : String(cardId);
    const inner = innerIdOf(promptNodeId);
    const text =
      inner === null ? line.text : t('run.report.innerLine', { id: inner, text: line.text });

    const entry = byNode.get(key);
    if (entry) {
      entry.lines.push({ ...line, text });
      return;
    }
    const label = runningNodeLabel(views, cardId === null ? promptNodeId : String(cardId));
    byNode.set(key, {
      index: label?.index ?? null,
      name: label?.name ?? `#${promptNodeId}`,
      lines: [{ ...line, text }],
    });
  };

  addFailureLines(input, general, add);

  const missingIds = new Set(input.missing.map((entry) => String(entry.nodeId)));
  for (const entry of input.missing) add(String(entry.nodeId), missingLine(entry));

  for (const model of input.missingModels ?? []) {
    add(model.promptNodeId, {
      tone: model.disabled ? 'warning' : 'error',
      text: t('run.report.missingModel', { name: model.name }),
      model,
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

export function reportAlert(report: RunReport): 'error' | 'warning' | 'none' {
  if (report.errors > 0) return 'error';
  return report.warnings > 0 ? 'warning' : 'none';
}
