// ─────────────────────────────
// 接続の型。接続できなかった理由の符号と、通知の口の状態・張り直しの決まり。
// ─────────────────────────────

/** 接続できなかった理由の符号。案内の分岐に使う */
export type ConnectionFailureCode =
  /** ブラウザがオフライン */
  | 'offline'
  /** https ページから http の接続先＝mixed content でブロックされる */
  | 'mixed-content'
  /** 公開オリジンからプライベート IP へのアクセス（Local Network Access の許可が要る） */
  | 'local-network'
  /** 届いてはいるが読ませてもらえない＝ComfyUI 側の --enable-cors-header 未設定 */
  | 'cors'
  /** 届かない＝起動していない・ポート違い・名前解決不能・証明書エラー */
  | 'down'
  /** 上の 2 つの切り分けが時間内に終わらなかった */
  | 'cors-or-down'
  /** 応答が遅すぎる */
  | 'timeout'
  /** 接続はできたが HTTP エラー（ステータスは `status` に入る） */
  | 'http-error'
  /** 接続はできたが応答が JSON として読めない */
  | 'bad-response'
  | 'unknown';

/** 通知の口（WebSocket）の状態 */
export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** 通知の口の張り直しの決まり。決めるのは実行の状況の層、従うのは通信の層 */
export interface ReconnectPolicy {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** null なら無制限に再試行する */
  readonly maxAttempts: number | null;
  /**
   * 1 回の試みで開くまで待つ上限。過ぎたら失敗と数える（null なら待ち続ける）。
   * 応答しない相手では、失敗が分かるまでに 1 回 20 秒ほどかかることがあり、
   * 10 回で数分に延びてしまう
   */
  readonly openTimeoutMs: number | null;
  /**
   * 開いていた口が切れた回数の上限。呼ぶ側が数えると決めた切れ（`countsDrop`）だけを数え、
   * 届いたら張り直しをやめて諦める（null なら数えない）。回数を戻す「しばらく続いた接続」とは別に数える
   */
  readonly maxDrops: number | null;
}

/** 張り直しを諦めた理由。`retries` は開けない失敗が続いた、`drops` は開いていた口が切れ続けた */
export type SocketGiveUp = 'retries' | 'drops';

/** ComfyUI への要求の失敗の種類 */
export type ComfyErrorKind =
  /** 到達できない。ブラウザからは CORS 拒否・LNA 拒否・ネットワーク断を区別できない */
  'unreachable' | 'timeout' | 'aborted' | 'http' | 'parse';

/**
 * ComfyUI との通信の失敗の理由の符号。見せる文は画面の側がこれから引く（通信の層は訳さない）
 */
export type ComfyFailureReason =
  /** 接続先の指定が空 */
  | 'base-url-empty'
  /** 接続先の指定が http(s) でない */
  | 'base-url-scheme'
  /** 接続先の指定が URL として読めない */
  | 'base-url-invalid'
  /** 呼んだ側が取りやめた */
  | 'aborted'
  /** 待ちの上限を過ぎた（`params.ms`） */
  | 'timeout'
  /** 届かない（CORS 拒否・LNA 拒否・未起動を区別できない） */
  | 'unreachable'
  /** 応答が JSON として読めない */
  | 'parse'
  /** HTTP エラー（`params.status`・`params.statusText`） */
  | 'http'
  /** 画像などの本文の取得が HTTP エラー（`params.status`） */
  | 'fetch-failed'
  /** 画像のアップロードの応答の形が違う */
  | 'upload-unexpected'
  /** 実行の投入を断られた（`params.reason` は接続先が返した理由） */
  | 'prompt-rejected'
  /** 同じ名前のワークフローが既にある（`params.path`） */
  | 'workflow-exists'
  /** 上書きしようとした先を KisaraUI が作っていない（`params.path`） */
  | 'workflow-not-owned';

/** 失敗の文に要る値。理由ごとに使うものだけが入る */
export interface ComfyFailureParams {
  /** 利用者が入れた接続先の指定 */
  readonly url?: string | undefined;
  /** 待った時間（ミリ秒） */
  readonly ms?: number | undefined;
  readonly status?: number | undefined;
  readonly statusText?: string | undefined;
  /** ワークフローのファイルの名前 */
  readonly path?: string | undefined;
  /** 接続先が返した理由の文（訳さない） */
  readonly reason?: string | undefined;
}

/**
 * 通信の層が投げる失敗の共通の形。投げた物（Error）にも、状態に持つ記録にもこの 2 つが載る
 */
export interface ComfyFailure {
  readonly reasonCode: ComfyFailureReason;
  readonly params: ComfyFailureParams;
}

/**
 * 通信の層の中で閉じ込めた想定外の失敗が、どこで起きたかの符号。帯の文は画面の側が引く
 */
export type ComfyFaultPlace =
  /** 履歴の 1 件の読み取り（`params.id` は prompt_id） */
  | { readonly code: 'history'; readonly params: { readonly id: string } }
  /** 通知の 1 通の読み取り */
  | { readonly code: 'notification'; readonly params: Readonly<Record<string, never>> };

/** 要求ごとの指定。実装の都合（取り寄せの差し替えなど）は実装の側で足す */
export interface RequestOptions {
  readonly signal?: AbortSignal;
  /** 既定 30 秒。/object_info は 20 MB 級なので短くしすぎない */
  readonly timeoutMs?: number;
  /** ブラウザのキャッシュの使い方（つないでいない間の結果画像は `force-cache`） */
  readonly cache?: RequestCache;
}

/**
 * 失敗の記録。投げられたものを窓口が変えた形で、状態に持てる（プレーンなオブジェクト）
 */
export interface RequestFailure extends ComfyFailure {
  readonly kind: ComfyErrorKind;
  readonly url: string;
  /** 記録のための英語の短い文。画面には理由の符号から引いた文を出す */
  readonly message: string;
  /** HTTP エラーのステータス。それ以外は null */
  readonly status?: number | null;
}

/**
 * 接続できなかった原因の推定（つなぐ手順の案内の分岐に使う）
 */
export interface ConnectionDiagnosis {
  readonly code: ConnectionFailureCode;
  readonly targetUrl: string;
  /** `http-error` のときのステータス。案内の分岐に使う */
  readonly status?: number;
}
