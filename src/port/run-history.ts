import type { SlotNode, ValueSlot } from '@/graph/run-record';

// ─────────────────────────────
// 実行の記録の型。記録のファイルの中身と、`/history` から取り出した記録の材料。
// ─────────────────────────────

/** プロンプトの役割の印。決められなければ null */
export type PromptRoleMark = 'posi' | 'nega' | null;

/** プロンプトの置き場。シードの置き場に役割を添えたもの */
export type PromptSlot = readonly [nodeId: string, input: string, role: PromptRoleMark];

/**
 * 骨組み。モデルと置き場。値は実行ごとに持つ
 */
export interface RunHistoryWorkflow {
  readonly model: readonly string[];
  readonly lora: readonly string[];
  readonly other: readonly string[];
  /** 置き場が指すノードの定義（ノード id → 名前とコメント）。各回の表示はこれを引く */
  readonly nodes: Readonly<Record<string, SlotNode>>;
  readonly seeds: readonly ValueSlot[];
  readonly prompts: readonly PromptSlot[];
  /** この画面から送ったときだけ分かるワークフロー名 */
  readonly name?: string | undefined;
}

/** 記録の 1 回の実行。骨組みとプロンプトは鍵で指す */
export interface RunHistoryRun {
  /** 開始時刻（epoch ミリ秒）。同じファイルの中で実行を見分ける鍵 */
  readonly start: number;
  /** 完了時刻（epoch ミリ秒）。分からなければ null */
  readonly end: number | null;
  /** 出力のパス（`サブフォルダ/名前`）。`output` 以外は末尾に ` [temp]` のような置き場の印 */
  readonly paths: readonly string[];
  /** `workflows` のキー。実行の形が無ければ null */
  readonly workflow: string | null;
  readonly prompt: string | null;
  readonly seeds: readonly unknown[];
}

/** 記録のファイルの中身。骨組みとプロンプトを共有し、実行を並べる */
export interface RunHistoryFile {
  readonly workflows: Readonly<Record<string, RunHistoryWorkflow>>;
  readonly prompts: Readonly<Record<string, readonly unknown[]>>;
  /** 開始時刻の古い順 */
  readonly runs: readonly RunHistoryRun[];
  /**
   * セッション名。付けていなければ持たない
   */
  readonly name?: string | undefined;
}

/** 記録のファイルの一覧の 1 件。時期は最後に書いた時刻（epoch ミリ秒。取れなければ null） */
export interface RunHistoryEntry {
  readonly name: string;
  readonly modified: number | null;
}

/** 記録のファイルを読んだ結果。形が違えば `unreadable`（書き手は上書きしない） */
export type RunHistoryRead =
  | { readonly kind: 'file'; readonly file: RunHistoryFile }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unreadable' };

/** `/history` の 1 件から取り出した、記録の材料 */
export interface HistoryRunSource {
  readonly promptId: string;
  /** 開始時刻（epoch ミリ秒）。取れなければ null */
  readonly startedAt: number | null;
  /** 完了時刻（epoch ミリ秒）。`status.messages` の最後の時刻。取れなければ null */
  readonly finishedAt: number | null;
  /** 出力のパス（`サブフォルダ/名前`）。`output` 以外は末尾に ` [temp]` のような置き場の印 */
  readonly paths: readonly string[];
  /** 送ったときの Workflow JSON（`prompt[3].extra_pnginfo.workflow`）。無ければ null */
  readonly workflow: unknown;
  /**
   * 送ったセッション（`prompt[3].kisara.session`）。無ければ null
   */
  readonly session: string | null;
  /**
   * `workflow` がこの画面から送ったものか。送ったものなら、別の画面が先に書いた記録も
   * これで書き直す
   */
  readonly sent?: boolean | undefined;
}
