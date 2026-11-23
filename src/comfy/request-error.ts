import type {
  ComfyErrorKind,
  ComfyFailureParams,
  ComfyFailureReason,
  RequestOptions as PortRequestOptions,
} from '@/port/connection';

interface RequestErrorOptions {
  readonly reasonCode?: ComfyFailureReason;
  readonly params?: ComfyFailureParams;
  readonly status?: number;
  readonly cause?: unknown;
  readonly body?: unknown;
  readonly message?: string;
}

export class ComfyRequestError extends Error {
  readonly kind: ComfyErrorKind;
  readonly reasonCode: ComfyFailureReason;
  readonly params: ComfyFailureParams;
  readonly url: string;
  readonly status: number | null;
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

const HTTP_NOT_FOUND = 404;

export function isNotFound(error: unknown): boolean {
  return error instanceof ComfyRequestError && error.status === HTTP_NOT_FOUND;
}

export function isMissing(error: unknown): boolean {
  return isNotFound(error) || (error instanceof ComfyRequestError && error.kind === 'parse');
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions extends PortRequestOptions {
  readonly fetchImpl?: FetchLike;
  readonly cache?: RequestCache;
}
