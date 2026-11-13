import { compareCardNumbers, type NodeView } from '@/graph/rows';
import { cardIdOfPromptNode, type ApiPromptDiagnostic } from '@/graph/to-api-prompt';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import type { FailureGuide } from '@/queue/connection-guide';
import type { ExecutionError } from '@/queue/execution-state';
import { runningNodeLabel } from '@/queue/running-node';

// ─────────────────────────────
// エラーのタブの中身。5 つの出どころをノードごとにまとめ、重なるものは 1 つにするだけの計算で、描かない。
// ─────────────────────────────

/** 投入を断られた理由（全体とノードごと） */
export interface RunRejection {
  readonly reason: string;
  /** ノード id → 理由。どのカードが弾かれたかを示す */
  readonly nodes: Readonly<Record<string, readonly string[]>>;
}

/** 報告の 1 行の重さ（失敗・注意・不明） */
export type ReportTone = 'error' | 'warning' | 'muted';

/** 報告の 1 行 */
export interface ReportLine {
  readonly tone: ReportTone;
  readonly text: string;
  /** 次にやることなどの補足（上から順に） */
  readonly steps?: readonly string[] | undefined;
}

/** 1 つのカードにまとめた報告 */
interface NodeReport {
  /** まとめる鍵。カードに戻せればその id、戻せなければ届いた id のまま */
  readonly key: string;
  /** カードの通し番号。戻せないもの・番号を持たないものは null */
  readonly index: string | null;
  readonly name: string;
  readonly lines: readonly ReportLine[];
}

/** エラーのタブに出す報告全体と件数 */
export interface RunReport {
  /** ノードに結び付かないもの */
  readonly general: readonly ReportLine[];
  readonly nodes: readonly NodeReport[];
  /** 失敗の件数（注意と不明は数えない） */
  readonly errors: number;
  /** 注意の件数 */
  readonly warnings: number;
  /** 全部の件数（1 行 = 1 件） */
  readonly total: number;
}

/** 定義が見つからないノード（線につながっているもの） */
interface MissingDefinition {
  readonly nodeId: NodeId;
  readonly classType: string;
  /** 無効化（ミュート・バイパス）している。実行には含まれないので注意に下げる */
  readonly disabled?: boolean | undefined;
}

/**
 * 一時保存の注意。`restored` は読み戻したタブの一時保存をほかのブラウザのタブが
 * 書いていた、`parallel` は写しの関係にあるタブがほかのブラウザのタブでも編集されている
 */
interface OtherWriterNotice {
  readonly kind: 'restored' | 'parallel';
  readonly name: string;
  /** 書き換えられた時刻の表記。分からなければ null */
  readonly time: string | null;
}

/** 報告の出どころ（定義の無いノード・変換の注意・断られた理由・別オリジンの拒否・実行の失敗） */
export interface RunReportInput {
  /** 定義が見つからないノード。実行しなくても出す */
  readonly missing: readonly MissingDefinition[];
  readonly diagnostics: readonly ApiPromptDiagnostic[];
  readonly rejection: RunRejection | null;
  /** 別オリジンの拒否の案内。拒否されていなければ null */
  readonly forbidden: FailureGuide | null;
  readonly error: ExecutionError | null;
  /** 実行が不明になった（失敗とは分ける） */
  readonly unknown: boolean;
  /** 一時保存の注意。実行しても消さない */
  readonly saveNotices?: readonly OtherWriterNotice[] | undefined;
}

/**
 * 実行の失敗の行（403・断られた・実行中の失敗のどれか 1 つ）。断られたときは実行の状況にも
 * 「最初のノード + 理由」が入るので、重ねて出さない
 */
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

/** 定義の無いノードの行。実行できない不具合は失敗、実行はできるもの（無効化しているノード）は注意 */
function missingLine(entry: MissingDefinition): ReportLine {
  if (entry.disabled === true) {
    return {
      tone: 'warning',
      text: t('run.report.missingDefinitionDisabled', { classType: entry.classType }),
    };
  }
  return { tone: 'error', text: t('run.report.missingDefinition', { classType: entry.classType }) };
}

/** subgraph の中なら内側の id（`12:34` の `34`）。外側そのものなら null */
function innerIdOf(promptNodeId: string): string | null {
  const at = promptNodeId.indexOf(':');
  return at < 0 ? null : promptNodeId.slice(at + 1);
}

/**
 * 出どころをノードごとにまとめた報告を組み立てる。subgraph の中のノード（`12:34`）は外側の
 * カードにまとめ、内側の id を添える
 */
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
      entry.lines.push({ tone: line.tone, text });
      return;
    }
    // 見出しはカードと同じ「通し番号 + コメント（無ければノード名）」
    const label = runningNodeLabel(views, cardId === null ? promptNodeId : String(cardId));
    byNode.set(key, {
      index: label?.index ?? null,
      name: label?.name ?? `#${promptNodeId}`,
      lines: [{ tone: line.tone, text }],
    });
  };

  addFailureLines(input, general, add);

  const missingIds = new Set(input.missing.map((entry) => String(entry.nodeId)));
  for (const entry of input.missing) add(String(entry.nodeId), missingLine(entry));

  for (const diagnostic of input.diagnostics) {
    // 定義が無いことは上で出している。同じ理由を重ねない
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

  // カードの並び順に揃える。戻せないものは最後
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

/**
 * エラーのタブの塗り。失敗があれば失敗、注意だけなら注意
 */
export function reportAlert(report: RunReport): 'error' | 'warning' | 'none' {
  if (report.errors > 0) return 'error';
  return report.warnings > 0 ? 'warning' : 'none';
}
