import { outputRefOf } from '@/graph/run-record';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import type { OutputFileRef } from '@/port/files';
import type { RunHistoryEntry, RunHistoryFile, RunHistoryWorkflow } from '@/port/run-history';
import type { QueueTask } from '@/queue/queue-tasks';
import type { ModelGroups, PromptRole, TaskPrompt } from '@/queue/task-detail';
import type { NodeLabeler } from '@/queue/task-failure';

export interface HistoryRun {
  readonly startedAt: number;
  readonly outputs: readonly OutputFileRef[];
  readonly prompt: string | null;
  readonly seeds: readonly unknown[];
  readonly entry: RunHistoryWorkflow;
  readonly promptValues: readonly unknown[];
  readonly finishedAt: number | null;
}

export interface HistoryCard {
  readonly key: string;
  readonly name: string | null;
  readonly workflowName: string | null;
  readonly runs: readonly HistoryRun[];
}

export function historySessionTitle(card: HistoryCard): string {
  return card.name ?? sessionIdOf(card);
}

function sessionIdOf(card: HistoryCard): string {
  return card.key.replace(/\.json$/, '');
}

export function formatHistorySession(card: HistoryCard): string {
  const id = sessionIdOf(card);
  return card.name === null
    ? t('history.detail.session', { id })
    : t('history.detail.sessionNamed', { name: card.name, id });
}

export function sessionLabel(entry: RunHistoryEntry): string {
  return entry.modified === null ? entry.name : formatDateTime(entry.modified);
}

export function sessionNames(entries: readonly RunHistoryEntry[]): string[] {
  const time = (entry: RunHistoryEntry): number => entry.modified ?? -Infinity;
  return [...entries]
    .sort((a, b) => time(a) - time(b) || a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}

export type NamedRunHistoryFile = readonly [name: string, file: RunHistoryFile];

export function namesUpTo(names: readonly string[], upTo: string | null): string[] {
  const end = upTo === null ? -1 : names.indexOf(upTo);
  return (end < 0 ? [...names] : names.slice(0, end + 1)).reverse();
}

export function buildHistoryCards(files: readonly NamedRunHistoryFile[]): HistoryCard[] {
  const cards: HistoryCard[] = [];

  for (const [fileName, file] of files) {
    const runs: HistoryRun[] = [];
    let workflowName: string | null = null;
    for (const run of file.runs) {
      const entry = run.workflow === null ? undefined : file.workflows[run.workflow];
      if (run.workflow === null || entry === undefined) continue;

      const item: HistoryRun = {
        startedAt: run.start,
        finishedAt: run.end,
        outputs: run.paths.map(outputRefOf),
        prompt: run.prompt,
        seeds: run.seeds,
        entry,
        promptValues: run.prompt === null ? [] : (file.prompts[run.prompt] ?? []),
      };
      workflowName = entry.name ?? workflowName;
      runs.push(item);
    }
    if (runs.length === 0) continue;
    cards.push({
      key: fileName,
      name: file.name ?? null,
      workflowName,
      runs: runs.sort((a, b) => b.startedAt - a.startedAt),
    });
  }
  return cards;
}

export function promptNumbers(card: HistoryCard): ReadonlyMap<string | null, number> {
  const numbers = new Map<string | null, number>();
  for (const run of [...card.runs].reverse()) {
    if (!numbers.has(run.prompt)) numbers.set(run.prompt, numbers.size + 1);
  }
  return numbers;
}

export function historyTasks(card: HistoryCard): QueueTask[] {
  return card.runs.map((run, index) => ({
    promptId: `history:${card.key}:${String(index)}`,
    state: 'done',
    number: null,
    outputs: run.outputs,
    progress: null,
    durationMs: null,
    message: null,
    startedAt: run.startedAt,
    recordedEnd: run.finishedAt ?? undefined,
  }));
}

export interface RunSeed {
  readonly nodeId: string;
  readonly name: string | null;
  readonly comment: string | null;
  readonly input: string;
  readonly value: unknown;
}

interface RunDetail {
  readonly models: ModelGroups;
  readonly prompts: readonly TaskPrompt[];
  readonly seeds: readonly RunSeed[];
  readonly label: NodeLabeler;
}

const ROLE_OF_MARK: Readonly<Record<'posi' | 'nega', PromptRole>> = {
  posi: 'positive',
  nega: 'negative',
};

function roleRank(prompt: TaskPrompt): number {
  return prompt.role === 'positive' ? 0 : prompt.role === 'negative' ? 1 : 2;
}

function textOf(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function slotNodeLabeler(nodes: RunHistoryWorkflow['nodes']): NodeLabeler {
  return (nodeId) => {
    const [name, comment] = nodes[nodeId] ?? [];
    if (name === undefined) return t('history.detail.nodeOnly', { id: nodeId });
    return comment === undefined
      ? t('history.detail.nodeLabel', { id: nodeId, name })
      : t('history.detail.nodeLabelComment', { id: nodeId, name, comment });
  };
}

export function runDetail(run: HistoryRun): RunDetail {
  const { entry } = run;
  const prompts = entry.prompts.map(([nodeId, input, role], index): TaskPrompt => ({
    nodeId,
    classType: entry.nodes[nodeId]?.[0] ?? '',
    inputName: input,
    text: textOf(run.promptValues[index]),
    role: role === null ? null : ROLE_OF_MARK[role],
  }));
  return {
    models: { model: entry.model, lora: entry.lora, other: entry.other },
    prompts: prompts
      .filter((prompt) => prompt.text.trim().length > 0)
      .sort((a, b) => roleRank(a) - roleRank(b)),
    seeds: entry.seeds.map(([nodeId, input], index) => {
      const [name, comment] = entry.nodes[nodeId] ?? [];
      return {
        nodeId,
        name: name ?? null,
        comment: comment ?? null,
        input,
        value: run.seeds[index] ?? null,
      };
    }),
    label: slotNodeLabeler(entry.nodes),
  };
}
