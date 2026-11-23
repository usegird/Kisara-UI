import { t } from '@/i18n';
import { messageOf, PlacedFault } from '@/lib/fault';
import type {
  ComfyFailure,
  ComfyFailureParams,
  ComfyFailureReason,
  ComfyFaultPlace,
  RequestFailure,
} from '@/port/connection';
import type { HistoryFailureLine } from '@/port/history';

const REASON_TEXT: Readonly<Record<ComfyFailureReason, (params: ComfyFailureParams) => string>> = {
  'base-url-empty': () => t('api.baseUrl.empty'),
  'base-url-scheme': (params) => t('api.baseUrl.unsupportedScheme', { url: params.url ?? '' }),
  'base-url-invalid': (params) => t('api.baseUrl.invalid', { url: params.url ?? '' }),
  aborted: () => t('api.request.aborted'),
  timeout: (params) => t('api.request.timeout', { ms: formatOptionalNumber(params.ms) }),
  unreachable: () => t('api.request.unreachable'),
  parse: () => t('api.request.parse'),
  http: (params) => `HTTP ${formatOptionalNumber(params.status)} ${params.statusText ?? ''}`,
  'fetch-failed': (params) =>
    t('api.request.fetchFailed', { status: formatOptionalNumber(params.status) }),
  'upload-unexpected': () => t('api.upload.unexpected'),
  'prompt-rejected': (params) => params.reason ?? t('api.prompt.rejected'),
  'workflow-exists': (params) => t('api.workflow.exists', { path: params.path ?? '' }),
  'workflow-not-owned': (params) => t('api.workflow.notOwned', { path: params.path ?? '' }),
};

const PLACE_TEXT: Readonly<
  Record<ComfyFaultPlace['code'], (params: Readonly<Record<string, string>>) => string>
> = {
  history: (params) => t('fault.where.history', { id: params.id ?? '' }),
  notification: () => t('fault.where.notification'),
};

export function formatComfyFailure(error: unknown): string {
  const failure = comfyFailureOf(error);
  return failure === null ? messageOf(error) : REASON_TEXT[failure.reasonCode](failure.params);
}

export function formatFault(error: unknown): string {
  if (!(error instanceof PlacedFault)) return formatComfyFailure(error);
  const { code, params } = error.place;
  const place = isPlace(code) ? PLACE_TEXT[code](params) : code;
  return `${place}: ${formatComfyFailure(error.cause)}`;
}

export function comfyFailureOf(value: unknown): ComfyFailure | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('reasonCode' in value) || !('params' in value)) return null;
  const { reasonCode, params } = value;
  if (typeof reasonCode !== 'string' || !isReason(reasonCode)) return null;
  if (typeof params !== 'object' || params === null) return null;
  return { reasonCode, params: paramsOf(params) };
}

export function fallbackRequestFailure(error: unknown, url: string): RequestFailure {
  const failure = comfyFailureOf(error) ?? { reasonCode: 'unreachable', params: {} };
  return { kind: 'unreachable', url, message: String(error), ...failure };
}

export function formatRunError(message: string | null): string {
  return message ?? t('api.run.error');
}

export function formatHistoryFailure(failure: HistoryFailureLine | null): string | null {
  if (failure === null) return null;
  if (failure.kind === 'interrupted') return t('api.run.interrupted');
  return formatRunError(failure.line);
}

function isPlace(value: string): value is ComfyFaultPlace['code'] {
  return Object.hasOwn(PLACE_TEXT, value);
}

function isReason(value: string): value is ComfyFailureReason {
  return Object.hasOwn(REASON_TEXT, value);
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function paramsOf(raw: object): ComfyFailureParams {
  const text = (key: string): string | undefined => {
    const value: unknown = Object.getOwnPropertyDescriptor(raw, key)?.value;
    return typeof value === 'string' ? value : undefined;
  };
  const number = (key: string): number | undefined => {
    const value: unknown = Object.getOwnPropertyDescriptor(raw, key)?.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  return {
    url: text('url'),
    ms: number('ms'),
    status: number('status'),
    statusText: text('statusText'),
    path: text('path'),
    reason: text('reason'),
  };
}
