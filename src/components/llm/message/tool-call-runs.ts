import { editedArguments } from '@/chat/tool-arguments';
import { toolCallRuns } from '@/chat/tool-results';
import type { ToolCallProblem, ToolCallRecord, ToolCallRun, ToolCallState } from '@/chat/types';
import { t, type MessageKey } from '@/i18n';
import { clamp } from '@/lib/clamp';
import { isRecord } from '@/lib/guards';
import type { OutputFileRef } from '@/port/files';

export interface ShownRun {
  readonly index: number;
  readonly count: number;
}

export type ShownRuns = ReadonlyMap<string, ShownRun>;

export type ArgumentEdits = ReadonlyMap<string, ReadonlyMap<string, string>>;

export const NO_EDITS: ReadonlyMap<string, string> = new Map();

export const STATE_TEXT: Readonly<Record<ToolCallState['kind'], MessageKey>> = {
  receiving: 'llm.tool.receiving',
  waiting: 'llm.tool.waiting',
  invalid: 'llm.tool.invalid',
  declined: 'llm.tool.declined',
  queued: 'llm.tool.queued',
  done: 'llm.tool.done',
  failed: 'llm.tool.failed',
  unknown: 'llm.tool.unknown',
};

export interface RunView {
  readonly index: number;
  readonly count: number;
  readonly runs: readonly ToolCallRun[];
  readonly held: number | null;
}

interface ArgumentLines {
  readonly lines: readonly { readonly name: string; readonly value: string }[];
  readonly editable: boolean;
}

export function isPending(state: ToolCallState): boolean {
  return state.kind === 'receiving' || state.kind === 'queued';
}

export function imagesOf(run: ToolCallRun | undefined): readonly OutputFileRef[] {
  return run?.state.kind === 'done' ? run.state.images : [];
}

export function runView(call: ToolCallRecord, shown: ShownRuns): RunView {
  const runs = settledRuns(call);
  const last = Math.max(runs.length - 1, 0);
  const inRange = (index: number): number => clamp(index, 0, last);
  const chosen = shown.get(call.id);
  if (chosen === undefined) return { index: last, count: runs.length, runs, held: null };
  if (chosen.count === runs.length || imagesOf(runs[last]).length === 0) {
    return { index: inRange(chosen.index), count: runs.length, runs, held: null };
  }
  return { index: last, count: runs.length, runs, held: inRange(chosen.index) };
}

export function detailRun(call: ToolCallRecord, shown: ShownRuns): ToolCallRun {
  if (isUnsettled(call.state)) return call;
  const view = runView(call, shown);
  return view.runs[view.index] ?? call;
}

export function argumentsToRun(
  call: ToolCallRecord,
  shown: ShownRuns,
  edits: ArgumentEdits,
): string {
  return editedArguments(detailRun(call, shown).arguments, edits.get(call.id) ?? NO_EDITS);
}

export function shownRunOf(call: ToolCallRecord, shown: ShownRuns): ShownRun {
  const { index, count } = runView(call, shown);
  return { index, count };
}

export function reasonOf(state: ToolCallState): string | null {
  if (state.kind === 'invalid') return formatProblem(state.problem);
  if (state.kind === 'failed' && state.message.length > 0) return state.message;
  if (state.kind === 'unknown') return t('llm.tool.unknownResult');
  if (state.kind === 'done' && state.images.length === 0) return t('llm.tool.noImages');
  return null;
}

export function argumentLines(raw: string): ArgumentLines {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) {
      const lines = Object.entries(parsed).map(([name, value]) => ({
        name,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      }));
      return { lines, editable: true };
    }
  } catch {
  }
  return { lines: raw.length === 0 ? [] : [{ name: '', value: raw }], editable: false };
}

export function generateTitleOf(connected: boolean, toolCount: number, label: string): string {
  if (!connected) return t('llm.tool.notConnected');
  return toolCount === 0 ? t('llm.tool.noTools') : label;
}

function isUnsettled(state: ToolCallState): boolean {
  return isPending(state) || state.kind === 'waiting';
}

function settledRuns(call: ToolCallRecord): readonly ToolCallRun[] {
  const runs = toolCallRuns(call);
  return isUnsettled(call.state) ? runs.slice(0, -1) : runs;
}

function formatProblem(problem: ToolCallProblem): string {
  if (problem.code === 'unknown-tool') return t('llm.tool.problem.unknownTool');
  if (problem.code === 'json') return t('llm.tool.problem.json');
  return t(`llm.tool.problem.${problem.code}`, { name: problem.argument });
}
