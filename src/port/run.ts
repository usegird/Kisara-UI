import type { ApiPrompt } from '@/graph/to-api-prompt';
import type { ComfyFailure } from '@/port/connection';
import type { OutputFileRef } from '@/port/files';

// ─────────────────────────────
// 実行のデータの型。実行の通知・投入の応答・失敗の記録・実行した API Prompt。
// 形だけを持ち、応答から作るのは通信の層（`comfy/schema.ts`）。
// ─────────────────────────────

/** 集約形式の進捗の、1 ノードの状態 */
export type ProgressNodeState = 'pending' | 'running' | 'finished' | 'error';

/** 集約形式の進捗の 1 ノード */
export interface ProgressNode {
  readonly nodeId: string;
  /** 展開後のノードを UI 上のどのノードに紐づけるか */
  readonly displayNodeId: string;
  readonly value: number;
  readonly max: number;
  readonly state: ProgressNodeState;
}

/** WebSocket で届く実行の通知を、使う欄だけにしたもの */
export type ComfyEvent =
  | { readonly type: 'status'; readonly queueRemaining: number | null }
  | { readonly type: 'execution_start'; readonly promptId: string | null }
  | {
      readonly type: 'execution_cached';
      readonly promptId: string | null;
      readonly nodes: string[];
    }
  | {
      readonly type: 'executing';
      readonly promptId: string | null;
      readonly node: string | null;
      readonly displayNode: string | null;
    }
  | { readonly type: 'execution_success'; readonly promptId: string | null }
  | {
      readonly type: 'execution_interrupted';
      readonly promptId: string | null;
      readonly node: string | null;
    }
  /** 現行の進捗通知（集約形式）。旧 `progress` に代わるもの */
  | {
      readonly type: 'progress_state';
      readonly promptId: string | null;
      readonly nodes: readonly ProgressNode[];
    }
  | {
      readonly type: 'progress';
      readonly promptId: string | null;
      readonly node: string | null;
      readonly value: number;
      readonly max: number;
    }
  | {
      readonly type: 'executed';
      readonly promptId: string | null;
      readonly node: string | null;
      /** そのノードが出したファイルの参照 */
      readonly files: readonly OutputFileRef[];
    }
  | {
      readonly type: 'execution_error';
      readonly promptId: string | null;
      readonly node: string | null;
      /** 例外の文面（無ければ種類）。どちらも無ければ null（既定の文は画面の側が足す） */
      readonly message: string | null;
    }
  /** 未知の種別。捨てずに記録できるよう素の type を残す */
  | { readonly type: 'unknown'; readonly rawType: string };

/** 投入を受け付けた応答。prompt id とキュー番号 */
export interface PromptAccepted {
  readonly promptId: string;
  readonly number: number | null;
}

/** 投入を断られたときの、1 ノード分の理由 */
export interface PromptNodeError {
  readonly nodeId: string;
  readonly classType: string;
  readonly messages: readonly string[];
}

/** 失敗したノードの 1 つの入力と、その値 */
export interface RunFailureInput {
  readonly name: string;
  /** ComfyUI が文字にした値（画像などは形の説明）。1 つの入力に複数の値が来ることがある */
  readonly values: readonly string[];
}

/** 実行が例外か中断で止まったときの記録 */
export interface RunFailure {
  /** `error` は例外、`interrupted` は中断 */
  readonly kind: 'error' | 'interrupted';
  /** 止まったノード（平坦化後の id） */
  readonly nodeId: string | null;
  readonly nodeType: string | null;
  readonly exceptionType: string | null;
  readonly message: string | null;
  readonly traceback: readonly string[];
  readonly inputs: readonly RunFailureInput[];
  /** 実際に動いたノード。**順は無い** */
  readonly executed: readonly string[];
  /** キャッシュを使ったノード（`execution_cached`） */
  readonly cached: readonly string[];
}

/** API Prompt の1ノード。`class_type` と入力だけ分かれば良い */
export interface PromptNode {
  readonly classType: string;
  readonly inputs: Readonly<Record<string, unknown>>;
}

/** `POST /prompt` に渡すもの */
export interface SubmitPromptParams {
  /**
   * 実行時に Workflow JSON から導出したもの。Workflow JSON と二重に持たないよう、状態として持たない
   */
  readonly prompt: ApiPrompt;
  readonly clientId: string;
  /**
   * 画像に埋め込ませる Workflow JSON。添えないと画像からワークフローを開けない
   */
  readonly workflow?: unknown;
  /**
   * セッションの id。`extra_data.kisara.session` に添える。本体は `/history` の
   * `prompt[3]` にそのまま残すので、実行の記録とタスクの列はこれで見分ける
   */
  readonly session?: string | undefined;
}

/** 投入を断られた理由（`POST /prompt` の 400）。どのノードが弾かれたかを持つ */
export interface PromptRejection extends ComfyFailure {
  /** 接続先が返した理由の文（訳さない）。無ければ null */
  readonly reason: string | null;
  readonly nodeErrors: readonly PromptNodeError[];
}
