import { splitRun, type SplitRun } from '@/graph/run-record';
import type { NodeDefinitionMap } from '@/graph/types';
import { hash53, stableStringify } from '@/lib/hash';
import { setOwn } from '@/lib/own-key';
import type {
  HistoryRunSource,
  PromptRoleMark,
  PromptSlot,
  RunHistoryFile,
  RunHistoryRun,
  RunHistoryWorkflow,
} from '@/port/run-history';
import {
  classifyRoles,
  groupModels,
  isModelFile,
  type ModelKindNames,
  type ModelUse,
  type PromptRole,
} from '@/queue/task-detail';

export const EMPTY_RUN_HISTORY: RunHistoryFile = { workflows: {}, prompts: {}, runs: [] };

interface AddRunsInput {
  readonly file: RunHistoryFile;
  readonly sources: readonly HistoryRunSource[];
  readonly definitions: NodeDefinitionMap;
  readonly kinds: ModelKindNames;
  readonly names: ReadonlyMap<string, string>;
  readonly limit?: number | undefined;
}

const ROLE_MARK: Readonly<Record<PromptRole, PromptRoleMark>> = {
  positive: 'posi',
  negative: 'nega',
};

function skeletonOf(split: SplitRun, kinds: ModelKindNames): Omit<RunHistoryWorkflow, 'name'> {
  const nodes = new Map(
    Object.entries(split.api).map(([id, node]) => [
      id,
      { classType: node.class_type, inputs: node.inputs },
    ]),
  );
  const roles = classifyRoles(nodes);
  const uses: ModelUse[] = [];
  for (const node of nodes.values()) {
    for (const [input, value] of Object.entries(node.inputs)) {
      if (typeof value === 'string' && isModelFile(value)) uses.push({ file: value, input });
    }
  }
  const role = (nodeId: string): PromptRoleMark => {
    const found = roles.get(nodeId);
    return found === undefined ? null : ROLE_MARK[found];
  };
  return {
    ...groupModels(uses, kinds),
    seeds: split.seedSlots,
    nodes: split.nodes,
    prompts: split.promptSlots.map((slot): PromptSlot => [...slot, role(slot[0])]),
  };
}

function skeletonKey(skeleton: Omit<RunHistoryWorkflow, 'name'>): string {
  return hash53(stableStringify(skeleton));
}

function promptsKey(prompts: readonly unknown[]): string {
  return hash53(stableStringify(prompts));
}

function fillName(
  workflows: Record<string, RunHistoryWorkflow>,
  key: string | null,
  name: string | undefined,
): boolean {
  const entry = key === null ? undefined : workflows[key];
  if (key === null || entry === undefined || entry.name !== undefined || name === undefined) {
    return false;
  }
  setOwn(workflows, key, { ...entry, name });
  return true;
}

export function addRuns({
  file,
  sources,
  definitions,
  kinds,
  names,
  limit,
}: AddRunsInput): RunHistoryFile {
  const recorded = new Map(file.runs.map((run) => [run.start, run]));
  const workflows: Record<string, RunHistoryWorkflow> = { ...file.workflows };
  const prompts: Record<string, readonly unknown[]> = { ...file.prompts };
  const changed = new Map<number, RunHistoryRun>();
  let named = false;

  const recordOf = (source: HistoryRunSource, start: number): RunHistoryRun => {
    const base = { start, end: source.finishedAt, paths: source.paths };
    const split = source.workflow === null ? null : splitRun(source.workflow, definitions);
    if (split === null) return { ...base, workflow: null, prompt: null, seeds: [] };

    const skeleton = skeletonOf(split, kinds);
    const workflowKey = skeletonKey(skeleton);
    const name = names.get(source.promptId);
    const existing = workflows[workflowKey];
    if (existing === undefined) {
      setOwn(workflows, workflowKey, { ...skeleton, ...(name === undefined ? {} : { name }) });
    } else if (existing.name === undefined && name !== undefined) {
      setOwn(workflows, workflowKey, { ...existing, name });
    }
    const promptKey = promptsKey(split.prompts);
    prompts[promptKey] ??= split.prompts;
    return { ...base, workflow: workflowKey, prompt: promptKey, seeds: split.seeds };
  };

  for (const source of sources) {
    const start = source.startedAt;
    if (start === null || changed.has(start)) continue;
    const before = recorded.get(start);
    if (before === undefined) {
      changed.set(start, recordOf(source, start));
      continue;
    }

    if (source.sent === true) {
      const next = recordOf(source, start);
      const end = before.end ?? next.end;
      if (!sameRecord(before, next)) {
        changed.set(start, { ...next, paths: before.paths, end });
        continue;
      }
    }
    if (before.end === null && source.finishedAt !== null) {
      changed.set(start, { ...before, end: source.finishedAt });
    }
    if (fillName(workflows, before.workflow, names.get(source.promptId))) named = true;
  }

  if (changed.size === 0 && !named) return file;
  const all = [
    ...file.runs.map((run) => changed.get(run.start) ?? run),
    ...[...changed.values()].filter((run) => !recorded.has(run.start)),
  ].sort((a, b) => a.start - b.start);
  const runs = limit === undefined || all.length <= limit ? all : all.slice(all.length - limit);
  return withoutUnused({ ...file, workflows, prompts, runs });
}

function sameRecord(a: RunHistoryRun, b: RunHistoryRun): boolean {
  return (
    a.workflow === b.workflow &&
    a.prompt === b.prompt &&
    JSON.stringify(a.seeds) === JSON.stringify(b.seeds)
  );
}

function withoutUnused(file: RunHistoryFile): RunHistoryFile {
  const usedWorkflows = new Set(file.runs.map((run) => run.workflow));
  const usedPrompts = new Set(file.runs.map((run) => run.prompt));
  return {
    ...file,
    workflows: Object.fromEntries(
      Object.entries(file.workflows).filter(([key]) => usedWorkflows.has(key)),
    ),
    prompts: Object.fromEntries(
      Object.entries(file.prompts).filter(([key]) => usedPrompts.has(key)),
    ),
  };
}
