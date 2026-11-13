import type { OutputFileRef } from '@/port/files';

// ─────────────────────────────
// キューと履歴の型。待ち行列の 1 件・履歴の 1 件とその詳細。
// ─────────────────────────────

/** 待ち行列の 1 件 */
export interface QueueEntry {
  readonly promptId: string;
  /** キュー番号（実行順）。取れなければ null */
  readonly number: number | null;
  /**
   * **投入時刻**（epoch ミリ秒）。`extra_data.create_time` にサーバーが入れる
   * （こちらは送っていない）。取れなければ null。
   *
   * 実行の**開始**時刻ではない（待ち行列に居た分だけ早い）。この画面が投げた実行なら
   * 通知から本当の開始時刻が分かるので、**それが無いときの代わり**として使う。
   */
  readonly createdAt: number | null;
  /**
   * 送ったセッション（`extra_data.kisara.session`）。無ければ null
   */
  readonly session: string | null;
}

/** 走っている実行と、待っている実行 */
export interface QueueSnapshot {
  readonly running: readonly QueueEntry[];
  readonly pending: readonly QueueEntry[];
}

/**
 * 履歴の 1 件の失敗の 1 行の元。`line` は例外の文面の 1 行目（無ければ種類。どちらも無ければ null）
 */
export interface HistoryFailureLine {
  /** `error` は例外、`interrupted` は中断 */
  readonly kind: 'error' | 'interrupted';
  readonly line: string | null;
}

/** 履歴の 1 件 */
export interface HistoryEntry {
  readonly promptId: string;
  /**
   * キュー番号（実行順）。`prompt[0]` に入っている
   */
  readonly number: number | null;
  /** 出力ファイルの参照（サムネイル表示に使う） */
  readonly outputs: readonly OutputFileRef[];
  /** 成功したか。`status_str` が取れなければ null */
  readonly success: boolean | null;
  /** 開始・終了時刻（epoch ミリ秒）。取れなければ null */
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  /** 失敗の 1 行の元（カードに出す文は画面の側が作る）。失敗の記録が無ければ null */
  readonly error: HistoryFailureLine | null;
  /**
   * 送ったセッション（`prompt[3].kisara.session`）。無ければ null
   */
  readonly session: string | null;
}

/**
 * 履歴1件の詳細。`prompt[2]` が**実行した API Prompt そのもの**で、
 * どのモデル・どのプロンプトで動いたかはここから読む。
 */
export interface HistoryDetail extends HistoryEntry {
  /** ノード id → `{class_type, inputs}`。検証は使う側で行う */
  readonly nodes: Readonly<Record<string, unknown>>;
  /** ノード id（subgraph の中は `59:70` の形）→ そのノードが出したファイル */
  readonly nodeOutputs: Readonly<Record<string, readonly OutputFileRef[]>>;
  /** 応答の1件分そのもの（端末に控えるため。削らずに持ち回す） */
  readonly entry: unknown;
}

/** 履歴の一覧と、控えるための応答そのもの */
export interface HistoryResult {
  readonly entries: readonly HistoryEntry[];
  /** prompt id → 応答の1件分（そのまま控えるため） */
  readonly raw: Readonly<Record<string, unknown>>;
}
