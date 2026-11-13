import { normalizeModelName } from '@/graph/model-files';
import { outputRefOf } from '@/graph/run-record';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import type { OutputFileRef } from '@/port/files';
import type { RunHistoryEntry, RunHistoryFile, RunHistoryWorkflow } from '@/port/run-history';
import type { QueueTask } from '@/queue/queue-tasks';
import type { ModelGroups, PromptRole, TaskPrompt } from '@/queue/task-detail';
import type { NodeLabeler } from '@/queue/task-failure';

// ─────────────────────────────
// 履歴のカードと詳細の組み立て（記録の合わせ方は run-history.ts）。純関数で、持つのはストア。
// ─────────────────────────────

/** 記録から読んだ実行 1 回 */
export interface HistoryRun {
  /** 開始時刻（epoch ミリ秒） */
  readonly startedAt: number;
  readonly outputs: readonly OutputFileRef[];
  readonly prompt: string | null;
  readonly seeds: readonly unknown[];
  /** 同じ鍵の骨組みのうち、この実行が入っていたファイルのもの */
  readonly entry: RunHistoryWorkflow;
  readonly promptValues: readonly unknown[];
  /** 完了時刻（epoch ミリ秒）。分からなければ null */
  readonly finishedAt: number | null;
}

/** 履歴のカード 1 枚（記録のファイル 1 つ＝セッション 1 つ） */
export interface HistoryCard {
  /** セッション（記録のファイル）の名前 */
  readonly key: string;
  /**
   * セッション名。付けていなければ null
   */
  readonly name: string | null;
  /** 最後に実行したワークフロー名。分からなければ null */
  readonly workflowName: string | null;
  /** 新しい順 */
  readonly runs: readonly HistoryRun[];
  /** 使ったモデル（区分が「モデル」のもの）のファイル名。名前の順 */
  readonly models: readonly string[];
}

/**
 * カードの 3 行目。セッション名、無ければモデル名を並べたもの、
 * それも無ければ「モデル不明」
 */
export function historyCardTitle(card: HistoryCard): string {
  if (card.name !== null) return card.name;
  return card.models.length === 0
    ? t('history.card.noModel')
    : card.models.map(modelLabel).join(', ');
}

/**
 * 履歴の詳細のセッションの 1 行。セッション名（コメント）が無ければ
 * セッション（UI のタブ）の id、あれば名前と括弧書きの id
 */
export function formatHistorySession(card: HistoryCard): string {
  const id = card.key.replace(/\.json$/, '');
  return card.name === null
    ? t('history.detail.session', { id })
    : t('history.detail.sessionNamed', { name: card.name, id });
}

/** モデルの表示名。フォルダと拡張子を落とす */
export function modelLabel(path: string): string {
  const file = normalizeModelName(path).split('/').at(-1) ?? path;
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

/** 時期（最後に書いた時刻）の日時の表記。分からなければファイル名のまま */
export function sessionLabel(entry: RunHistoryEntry): string {
  return entry.modified === null ? entry.name : formatDateTime(entry.modified);
}

/** 記録のファイルを時期の古い順に並べた名前。時期の分からないものは先頭、同じなら名前の順 */
export function sessionNames(entries: readonly RunHistoryEntry[]): string[] {
  const time = (entry: RunHistoryEntry): number => entry.modified ?? -Infinity;
  return [...entries]
    .sort((a, b) => time(a) - time(b) || a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}

/** 記録のファイル（ファイル名と中身の組） */
export type NamedRunHistoryFile = readonly [name: string, file: RunHistoryFile];

/**
 * さかのぼる範囲のファイル名を、**時期の新しい順**に返す。`upTo` のファイルと、
 * それより前に書かれたファイルだけ。`upTo` が null か、もう無いファイルなら全部。
 * 中身は読まずに決まる（並びは一覧の時期だけで決める）
 */
export function namesUpTo(names: readonly string[], upTo: string | null): string[] {
  const end = upTo === null ? -1 : names.indexOf(upTo);
  return (end < 0 ? [...names] : names.slice(0, end + 1)).reverse();
}

/**
 * 記録のファイルから履歴のカードを作る。ファイル 1 つ（＝セッション 1 つ）を 1 枚にする。
 * 拾い出せなかった実行は出さない。並びは渡した順（時期の新しい順に渡す）。読んでいないファイルは渡さない
 */
export function buildHistoryCards(files: readonly NamedRunHistoryFile[]): HistoryCard[] {
  const cards: HistoryCard[] = [];

  for (const [fileName, file] of files) {
    const runs: HistoryRun[] = [];
    const models = new Set<string>();
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
      for (const model of entry.model) models.add(model);
      workflowName = entry.name ?? workflowName;
      runs.push(item);
    }
    if (runs.length === 0) continue;
    cards.push({
      // セッションのファイル名（実行が足されても、範囲を変えても変わらない）
      key: fileName,
      name: file.name ?? null,
      workflowName,
      runs: runs.sort((a, b) => b.startedAt - a.startedAt),
      models: [...models].sort(),
    });
  }
  return cards;
}

/** プロンプトの番号（`P1` の数）。カードの中で古く使われた順に 1 から振る。同じ番号は同じ文章 */
export function promptNumbers(card: HistoryCard): ReadonlyMap<string | null, number> {
  const numbers = new Map<string | null, number>();
  for (const run of [...card.runs].reverse()) {
    if (!numbers.has(run.prompt)) numbers.set(run.prompt, numbers.size + 1);
  }
  return numbers;
}

/** カードの実行を、ビューワーに渡すタスクの並びにする（新しい順） */
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

/**
 * シードの欄の 1 行。ノード名とコメントは骨組みの定義から引く
 */
export interface RunSeed {
  readonly nodeId: string;
  /** ノード名。定義が無ければ null */
  readonly name: string | null;
  /** コメント（`title`）。無ければ null */
  readonly comment: string | null;
  readonly input: string;
  readonly value: unknown;
}

/** 履歴の詳細の欄の中身（モデル・プロンプト・シード） */
interface RunDetail {
  readonly models: ModelGroups;
  /** ポジ → ネガ → 未分類の順 */
  readonly prompts: readonly TaskPrompt[];
  readonly seeds: readonly RunSeed[];
  /** ノードの表記（ノード番号・ノード名・コメント）。骨組みの定義から引く */
  readonly label: NodeLabeler;
}

const ROLE_OF_MARK: Readonly<Record<'posi' | 'nega', PromptRole>> = {
  posi: 'positive',
  nega: 'negative',
};

function roleRank(prompt: TaskPrompt): number {
  return prompt.role === 'positive' ? 0 : prompt.role === 'negative' ? 1 : 2;
}

/** プロンプトの値の文字列。文字列でなければ JSON にする（記録が壊れていても欄は出す） */
function textOf(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** ノードの表記。「ノード 12 名前 / コメント」。定義が無ければノード番号だけ */
function slotNodeLabeler(nodes: RunHistoryWorkflow['nodes']): NodeLabeler {
  return (nodeId) => {
    const [name, comment] = nodes[nodeId] ?? [];
    if (name === undefined) return t('history.detail.nodeOnly', { id: nodeId });
    return comment === undefined
      ? t('history.detail.nodeLabel', { id: nodeId, name })
      : t('history.detail.nodeLabelComment', { id: nodeId, name, comment });
  };
}

/**
 * 記録の骨組みと実行ごとの値から、詳細の欄の中身を作る
 */
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
    // 文章が空のもの（展開前の空の欄など）は出さない
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
