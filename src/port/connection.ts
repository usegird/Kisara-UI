export type ConnectionFailureCode =
  | 'offline'
  | 'mixed-content'
  | 'local-network'
  | 'cors'
  | 'down'
  | 'cors-or-down'
  | 'timeout'
  | 'http-error'
  | 'bad-response'
  | 'unknown';

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface ReconnectPolicy {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxAttempts: number | null;
  readonly openTimeoutMs: number | null;
  readonly maxDrops: number | null;
}

export type SocketGiveUp = 'retries' | 'drops';

export type ComfyErrorKind =
  'unreachable' | 'timeout' | 'aborted' | 'http' | 'parse';

export type ComfyFailureReason =
  | 'base-url-empty'
  | 'base-url-scheme'
  | 'base-url-invalid'
  | 'aborted'
  | 'timeout'
  | 'unreachable'
  | 'parse'
  | 'http'
  | 'fetch-failed'
  | 'upload-unexpected'
  | 'prompt-rejected'
  | 'workflow-exists'
  | 'workflow-not-owned';

export interface ComfyFailureParams {
  readonly url?: string | undefined;
  readonly ms?: number | undefined;
  readonly status?: number | undefined;
  readonly statusText?: string | undefined;
  readonly path?: string | undefined;
  readonly reason?: string | undefined;
}

export interface ComfyFailure {
  readonly reasonCode: ComfyFailureReason;
  readonly params: ComfyFailureParams;
}

export type ComfyFaultPlace =
  | { readonly code: 'history'; readonly params: { readonly id: string } }
  | { readonly code: 'notification'; readonly params: Readonly<Record<string, never>> };

export interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly cache?: RequestCache;
}

export interface RequestFailure extends ComfyFailure {
  readonly kind: ComfyErrorKind;
  readonly url: string;
  readonly message: string;
  readonly status?: number | null;
}

export interface ConnectionDiagnosis {
  readonly code: ConnectionFailureCode;
  readonly targetUrl: string;
  readonly status?: number;
}
