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

// ─────────────────────────────
// ComfyUI との通信の失敗を、理由の符号から画面に出す文にする唯一の置き場。状態と部品の両方が読む。
// 通信の層のクラスは読まず、窓口の型の形（理由の符号と値）で見分ける。
// ─────────────────────────────

/**
 * 理由の符号ごとの文。鍵と値は通信の層で訳していたときと同じにする（利用者が見る文を変えない）。
 * 鍵の一覧は、形で見分けるときに知らない文字列を符号と取り違えないためにも使う
 */
const REASON_TEXT: Readonly<Record<ComfyFailureReason, (params: ComfyFailureParams) => string>> = {
  'base-url-empty': () => t('api.baseUrl.empty'),
  'base-url-scheme': (params) => t('api.baseUrl.unsupportedScheme', { url: params.url ?? '' }),
  'base-url-invalid': (params) => t('api.baseUrl.invalid', { url: params.url ?? '' }),
  aborted: () => t('api.request.aborted'),
  timeout: (params) => t('api.request.timeout', { ms: formatOptionalNumber(params.ms) }),
  unreachable: () => t('api.request.unreachable'),
  parse: () => t('api.request.parse'),
  // 接続先が返した番号と文をそのまま出す（訳さない）
  http: (params) => `HTTP ${formatOptionalNumber(params.status)} ${params.statusText ?? ''}`,
  'fetch-failed': (params) =>
    t('api.request.fetchFailed', { status: formatOptionalNumber(params.status) }),
  'upload-unexpected': () => t('api.upload.unexpected'),
  'prompt-rejected': (params) => params.reason ?? t('api.prompt.rejected'),
  'workflow-exists': (params) => t('api.workflow.exists', { path: params.path ?? '' }),
  'workflow-not-owned': (params) => t('api.workflow.notOwned', { path: params.path ?? '' }),
};

/** 通信の層の中で閉じ込めた失敗の、場所の符号ごとの文 */
const PLACE_TEXT: Readonly<
  Record<ComfyFaultPlace['code'], (params: Readonly<Record<string, string>>) => string>
> = {
  history: (params) => t('fault.where.history', { id: params.id ?? '' }),
  notification: () => t('fault.where.notification'),
};

/**
 * 投げられた値（または状態に持った失敗の記録）を、画面に出す文にする。
 * 理由の符号を持たない値は `messageOf` に戻す
 */
export function formatComfyFailure(error: unknown): string {
  const failure = comfyFailureOf(error);
  return failure === null ? messageOf(error) : REASON_TEXT[failure.reasonCode](failure.params);
}

/**
 * 想定外の失敗の帯に出す文。場所を符号で持つ知らせは「場所: 中身」の形に訳し、ほかは
 * `formatComfyFailure` と同じにする
 */
export function formatFault(error: unknown): string {
  if (!(error instanceof PlacedFault)) return formatComfyFailure(error);
  const { code, params } = error.place;
  const place = isPlace(code) ? PLACE_TEXT[code](params) : code;
  return `${place}: ${formatComfyFailure(error.cause)}`;
}

/** 値が通信の層の失敗の形（理由の符号と値）を持てば、その 2 つを返す。持たなければ null */
export function comfyFailureOf(value: unknown): ComfyFailure | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('reasonCode' in value) || !('params' in value)) return null;
  const { reasonCode, params } = value;
  if (typeof reasonCode !== 'string' || !isReason(reasonCode)) return null;
  if (typeof params !== 'object' || params === null) return null;
  return { reasonCode, params: paramsOf(params) };
}

/**
 * 窓口が失敗の記録に変えられなかった値（要求の前に投げられた物など）を、届かなかった失敗として記録にする。
 * 理由の符号を持つ値（接続先の指定の誤り）は、その符号を残す
 */
export function fallbackRequestFailure(error: unknown, url: string): RequestFailure {
  const failure = comfyFailureOf(error) ?? { reasonCode: 'unreachable', params: {} };
  return { kind: 'unreachable', url, message: String(error), ...failure };
}

/** 実行中に届いた例外の文。文面も種類も無ければ既定の文にする */
export function formatRunError(message: string | null): string {
  return message ?? t('api.run.error');
}

/** 履歴の 1 件の失敗をカードに出す 1 行にする。中断はそう書く */
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

/** 値の物から、型の合う項目だけを拾う（状態や控えを経た物でも落ちない） */
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
