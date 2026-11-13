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

// ─────────────────────────────
// 実行の記録の合わせ方・記録のファイルの並べ方。純関数。読み書きは `comfy/`、
// 持つのはストア。
// ─────────────────────────────

/** 中身の無い記録（まだファイルが無いセッション） */
export const EMPTY_RUN_HISTORY: RunHistoryFile = { workflows: {}, prompts: {}, runs: [] };

/** 実行の記録に足す材料 */
interface AddRunsInput {
  readonly file: RunHistoryFile;
  readonly sources: readonly HistoryRunSource[];
  readonly definitions: NodeDefinitionMap;
  /**
   * モデルの区分を決める一覧（書くときに区分を決める）
   */
  readonly kinds: ModelKindNames;
  /** prompt id → この画面から送ったときのワークフロー名 */
  readonly names: ReadonlyMap<string, string>;
  /** 残す実行の数。超えたら開始時刻の古い順に外す。省けば外さない */
  readonly limit?: number | undefined;
}

const ROLE_MARK: Readonly<Record<PromptRole, PromptRoleMark>> = {
  positive: 'posi',
  negative: 'nega',
};

/** 骨組み（名前を除く）。モデルを区分ごとに、プロンプトの置き場に役割を添える */
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

/** 骨組みの鍵。カードの通し番号が変わる動かし方をしたときだけ変わる */
function skeletonKey(skeleton: Omit<RunHistoryWorkflow, 'name'>): string {
  return hash53(stableStringify(skeleton));
}

/** プロンプトの値の並びの鍵 */
function promptsKey(prompts: readonly unknown[]): string {
  return hash53(stableStringify(prompts));
}

/** 名前の無い骨組みに名前を足す。足したら true */
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

/**
 * 記録に新しい実行を足す。保存していない実行も残す。開始時刻の分からない実行と、
 * 開始時刻が既に記録にある実行は足さない。足したものが無ければ同じファイルを返す（書かなくてよい印）。
 *
 * **既にある実行でも、名前の無い骨組みには名前を足す。** 同じ接続先を開いている別の画面が
 * 先に書くと、送った画面だけが知っている名前が記録に入らないため。同じ理由で、送った画面は
 * 別の画面が `/history` の値で書いた実行を、送った値で書き直す（`sent`）。
 * 完了時刻の無い実行にも、分かれば完了時刻を足す
 */
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
  /** 足す・置き換える実行（開始時刻 → 実行） */
  const changed = new Map<number, RunHistoryRun>();
  let named = false;

  /** 骨組みとプロンプトを足し、実行の値を返す。拾い出せなければ値なし */
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

    // 送った画面は、別の画面が `/history` の値で先に書いた分を送った値で書き直す
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
  // 上限を超えた分は古い順に外す（外した実行だけが指す骨組みとプロンプトも下で外れる）
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

/** どの実行からも指されなくなった骨組みとプロンプトを外す（書き直した後に残る分） */
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
