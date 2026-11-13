import type {
  ComfyErrorKind,
  ComfyFailureParams,
  ComfyFailureReason,
  RequestOptions as PortRequestOptions,
} from '@/port/connection';

// ─────────────────────────────
// 通信の失敗の種別と理由の符号、要求の共通の指定。送る処理を持たない。文言は画面の側が符号から引く。
// 公開用のデモは送る処理（client.ts）だけを差し替え、ここは本体と共有する。
// ─────────────────────────────

/** 要求の失敗を作るときの指定 */
interface RequestErrorOptions {
  /** 省けば種類と同じ名前の理由にする（`http` は `http`） */
  readonly reasonCode?: ComfyFailureReason;
  readonly params?: ComfyFailureParams;
  readonly status?: number;
  readonly cause?: unknown;
  readonly body?: unknown;
  /** 記録のための文を差し替える（省けば理由の符号から作る） */
  readonly message?: string;
}

/** ComfyUI への要求の失敗。種別・理由の符号・URL・ステータス・読めた本文を持つ */
export class ComfyRequestError extends Error {
  readonly kind: ComfyErrorKind;
  readonly reasonCode: ComfyFailureReason;
  readonly params: ComfyFailureParams;
  readonly url: string;
  readonly status: number | null;
  /** エラー応答の本文（読めた場合）。検証エラーの内訳を取り出すのに使う */
  readonly body: unknown;

  constructor(kind: ComfyErrorKind, url: string, options: RequestErrorOptions = {}) {
    const reasonCode = options.reasonCode ?? kind;
    const params = options.params ?? {};
    super(
      options.message ?? developerMessage(reasonCode, params),
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'ComfyRequestError';
    this.kind = kind;
    this.reasonCode = reasonCode;
    this.params = params;
    this.url = url;
    this.status = options.status ?? null;
    this.body = options.body ?? null;
  }
}

/**
 * 記録のための英語の短い文。画面には出さない（画面の文は理由の符号から引く）。
 * 接続先の指定は載せない（診断の記録で接続先を外せるようにする）
 */
export function developerMessage(
  reasonCode: ComfyFailureReason,
  params: ComfyFailureParams,
): string {
  const detail = [
    params.status === undefined ? null : `status ${String(params.status)}`,
    params.statusText,
    params.ms === undefined ? null : `${String(params.ms)} ms`,
    params.path,
    params.reason,
  ].filter((part) => part !== null && part !== undefined && part.length > 0);
  return detail.length === 0 ? reasonCode : `${reasonCode}: ${detail.join(' ')}`;
}

/** 経路・ファイルが無いときの HTTP の状態 */
const HTTP_NOT_FOUND = 404;

/** 接続先が 404（経路かファイルが無い）を返した失敗か */
export function isNotFound(error: unknown): boolean {
  return error instanceof ComfyRequestError && error.status === HTTP_NOT_FOUND;
}

/**
 * 置き場の 1 件が無いか、中身が読めないか。どちらも「その 1 件は無い」として扱う
 * （一覧の読み込みを、読めない 1 件で止めない）
 */
export function isMissing(error: unknown): boolean {
  return isNotFound(error) || (error instanceof ComfyRequestError && error.kind === 'parse');
}

/** `fetch` と同じ形の関数（テストで差し替える） */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 要求ごとの指定。窓口の指定に、送る関数とキャッシュの使い方を足す */
export interface RequestOptions extends PortRequestOptions {
  /** テストや拡張移植時に差し替える */
  readonly fetchImpl?: FetchLike;
  /** ブラウザのキャッシュの使い方。読み直して合わせる要求は `no-store` にする */
  readonly cache?: RequestCache;
}
