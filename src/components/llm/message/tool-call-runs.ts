import { editedArguments } from '@/chat/tool-arguments';
import { toolCallRuns } from '@/chat/tool-results';
import type { ToolCallProblem, ToolCallRecord, ToolCallRun, ToolCallState } from '@/chat/types';
import { t, type MessageKey } from '@/i18n';
import { clamp } from '@/lib/clamp';
import { isRecord } from '@/lib/guards';
import type { OutputFileRef } from '@/port/files';

// ─────────────────────────────
// ワークフローの呼び出しの表示の決まり。表示する実行・次に実行する引数・状態の文と理由・引数の行を
// 呼び出しの記録から導く（描かない）。
// ─────────────────────────────

/**
 * 表示している実行。`count` は選んだときに出せた実行の数で、実行が増えた（受け取った）ら最後の
 * 実行に切り替える（実行し直している間は表示を変えない）
 */
export interface ShownRun {
  readonly index: number;
  readonly count: number;
}

/** 呼び出しの id → 表示している実行。無ければ最後の実行 */
export type ShownRuns = ReadonlyMap<string, ShownRun>;

/** 呼び出しの id → 直した引数（引数名 → 打った文字） */
export type ArgumentEdits = ReadonlyMap<string, ReadonlyMap<string, string>>;

/** 直した引数が無いとき */
export const NO_EDITS: ReadonlyMap<string, string> = new Map();

/** 状態の文 */
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

/** 表示する実行と、画像の欄に出せる実行 */
export interface RunView {
  /** 表示する実行の番号（出せる実行の中で） */
  readonly index: number;
  readonly count: number;
  readonly runs: readonly ToolCallRun[];
  /** 新しい実行へ切り替える途中なら、画像を読み終えるまで出しておく前の番号 */
  readonly held: number | null;
}

/** 引数の行 */
interface ArgumentLines {
  readonly lines: readonly { readonly name: string; readonly value: string }[];
  /** JSON の物として読めたか（読めたものだけ値を直せる） */
  readonly editable: boolean;
}

/** 受け取り中・実行中（実行し直すのアイコンを回す） */
export function isPending(state: ToolCallState): boolean {
  return state.kind === 'receiving' || state.kind === 'queued';
}

/** 実行の画像。終わっていなければ空 */
export function imagesOf(run: ToolCallRun | undefined): readonly OutputFileRef[] {
  return run?.state.kind === 'done' ? run.state.images : [];
}

/**
 * 表示する実行。選んでいなければ最後の実行。選んだあとに実行が増えたら最後の実行へ切り替えるが、
 * 新しい実行に画像が無ければ（失敗など）選んだものを出したままにする（画像の欄を変えない）
 */
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

/** 状態の行に出す実行（結果がまだ無ければ今の実行、ほかは表示している実行） */
export function detailRun(call: ToolCallRecord, shown: ShownRuns): ToolCallRun {
  if (isUnsettled(call.state)) return call;
  const view = runView(call, shown);
  return view.runs[view.index] ?? call;
}

/** 次に実行するときの引数の本文（表示している実行の引数に、直した値を重ねる） */
export function argumentsToRun(
  call: ToolCallRecord,
  shown: ShownRuns,
  edits: ArgumentEdits,
): string {
  return editedArguments(detailRun(call, shown).arguments, edits.get(call.id) ?? NO_EDITS);
}

/** 今の表示をそのまま留める印（実行し直している間、画像の欄を変えない） */
export function shownRunOf(call: ToolCallRecord, shown: ShownRuns): ShownRun {
  const { index, count } = runView(call, shown);
  return { index, count };
}

/** 畳んだ中に出す理由。無ければ null */
export function reasonOf(state: ToolCallState): string | null {
  if (state.kind === 'invalid') return formatProblem(state.problem);
  if (state.kind === 'failed' && state.message.length > 0) return state.message;
  if (state.kind === 'unknown') return t('llm.tool.unknownResult');
  if (state.kind === 'done' && state.images.length === 0) return t('llm.tool.noImages');
  return null;
}

/** 引数を 1 行ずつ。JSON の物として読めなければ本文のまま 1 行 */
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
    // 受け取り中・崩れた本文はそのまま出す
  }
  return { lines: raw.length === 0 ? [] : [{ name: '', value: raw }], editable: false };
}

/** 生成の操作の説明。押せないときはその理由 */
export function generateTitleOf(connected: boolean, toolCount: number, label: string): string {
  if (!connected) return t('llm.tool.notConnected');
  return toolCount === 0 ? t('llm.tool.noTools') : label;
}

/** まだ結果が無い（承諾待ちを含む。画像の欄にはまだ加えない） */
function isUnsettled(state: ToolCallState): boolean {
  return isPending(state) || state.kind === 'waiting';
}

/** 画像の欄に出せる実行（結果の無い最後の実行は、受け取るまで加えない） */
function settledRuns(call: ToolCallRecord): readonly ToolCallRun[] {
  const runs = toolCallRuns(call);
  return isUnsettled(call.state) ? runs.slice(0, -1) : runs;
}

function formatProblem(problem: ToolCallProblem): string {
  if (problem.code === 'unknown-tool') return t('llm.tool.problem.unknownTool');
  if (problem.code === 'json') return t('llm.tool.problem.json');
  return t(`llm.tool.problem.${problem.code}`, { name: problem.argument });
}
