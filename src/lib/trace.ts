import { isRecord } from '@/lib/guards';
import { isRemoteHost } from '@/lib/remote-host';
import { truncate } from '@/lib/text';

// ─────────────────────────────
// 診断のログの入れ物。失敗と前後の出来事を画面の中だけに溜める。
// ─────────────────────────────

export const TRACE_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
/** ログの段階（粗い順） */
export type TraceLevel = (typeof TRACE_LEVELS)[number];

/** 分野。画面の出来事は、そのときのタブの分野に入れる（ワークフロー・画像は ComfyUI、会話は LLM） */
export const TRACE_AREAS = ['comfy', 'llm'] as const;
/** ログの分野 */
export type TraceArea = (typeof TRACE_AREAS)[number];

/** 分野ごとに選んだ段階 */
export type TraceLevels = Readonly<Record<TraceArea, TraceLevel>>;

export const DEFAULT_TRACE_LEVELS: TraceLevels = { comfy: 'error', llm: 'error' };

function isTraceLevel(value: unknown): value is TraceLevel {
  return typeof value === 'string' && (TRACE_LEVELS as readonly string[]).includes(value);
}

/** 端末に残した段階を読む。読めない分野は既定（`error`） */
export function parseTraceLevels(raw: unknown): TraceLevels {
  const saved = isRecord(raw) ? raw : {};
  const read = (area: TraceArea): TraceLevel => {
    const value = saved[area];
    return isTraceLevel(value) ? value : DEFAULT_TRACE_LEVELS[area];
  };
  return { comfy: read('comfy'), llm: read('llm') };
}

/**
 * 端末に残す段階。`debug` は残さず `warn` にする（読み込み直すと戻る）
 */
export function storedTraceLevels(value: TraceLevels): TraceLevels {
  const keep = (level: TraceLevel): TraceLevel => (level === 'debug' ? 'warn' : level);
  return { comfy: keep(value.comfy), llm: keep(value.llm) };
}

/** 失敗の上限（いつも溜める） */
export const FAULT_CAPACITY = 50;

/** 出来事の上限。選んだ段階のうちいちばん細かいもので決まる（`error` だけなら溜めない） */
export const EVENT_CAPACITY: Readonly<Record<TraceLevel, number>> = {
  error: 0,
  warn: 200,
  info: 500,
  debug: 2000,
};

/** 原因の連なりをたどる深さ */
const CAUSE_DEPTH = 5;
/** 1 つの文面の長さの上限（スタックトレースを含む） */
const TEXT_MAX = 4000;

/** 出来事に添える値。文字・数・真偽だけ（物を入れると本文が紛れ込む） */
export type TraceDetail = Readonly<Record<string, string | number | boolean | null>>;

/** 失敗 1 つの名前と文面 */
interface TraceCause {
  readonly name: string;
  readonly message: string;
}

/** 溜めた失敗 1 件 */
interface TraceFault {
  readonly at: string;
  /** どこで起きたか（部品名・操作名） */
  readonly where: string;
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
  readonly causes: readonly TraceCause[];
  /** 描けなかった部品の位置（React の `componentStack`） */
  readonly componentStack: string | null;
  /** 続けて同じ失敗が起きた回数（1 回なら無い）。`at` は最後に起きた時刻 */
  readonly count?: number;
}

/** 溜めた出来事 1 件 */
interface TraceEvent {
  readonly at: string;
  readonly area: TraceArea;
  readonly level: TraceLevel;
  readonly kind: string;
  readonly detail: TraceDetail | null;
}

/** 読んだ時点のログの写し */
interface TraceSnapshot {
  readonly levels: TraceLevels;
  readonly faults: readonly TraceFault[];
  readonly events: readonly TraceEvent[];
}

// ストアに置かない: 出来事のたびに購読している部品が描き直されないよう、ただの変数に持つ。
// 失敗と出来事は別に数える（細かい出来事が増えても失敗を押し出さない）
let levels: TraceLevels = DEFAULT_TRACE_LEVELS;
let faults: TraceFault[] = [];
/** 出来事は分野ごとに数える（多い分野がほかを押し出さない） */
let events: Record<TraceArea, TraceEvent[]> = { comfy: [], llm: [] };

/** その分野の上限を超えた古い分を外す */
function trimEvents(area: TraceArea): void {
  const list = events[area];
  const capacity = EVENT_CAPACITY[levels[area]];
  if (list.length > capacity) list.splice(0, list.length - capacity);
}

/** 段階を入れ替える。細かさを下げても、それまでのログは消さない（上限を超えた古い分だけ外す） */
export function setTraceLevels(next: TraceLevels): void {
  levels = next;
  for (const area of TRACE_AREAS) trimEvents(area);
}

/** その分野でその段階を溜めるか */
export function traceEnabled(area: TraceArea, level: TraceLevel): boolean {
  return TRACE_LEVELS.indexOf(level) <= TRACE_LEVELS.indexOf(levels[area]);
}

/** どこかの分野が `debug` か（画面に印を出す） */
export function traceVerbose(value: TraceLevels = levels): boolean {
  return TRACE_AREAS.some((area) => value[area] === 'debug');
}

/**
 * 出来事を 1 件溜める。中身は段階を見てから作る（段階の下なら `detail` を呼ばない）。
 * `error` の段階の出来事は無い（失敗は `traceFault` で溜める）
 */
export function traceEvent(
  area: TraceArea,
  level: Exclude<TraceLevel, 'error'>,
  kind: string,
  detail?: () => TraceDetail,
): void {
  if (!traceEnabled(area, level)) return;
  const entry: TraceEvent = {
    at: new Date().toISOString(),
    area,
    level,
    kind,
    detail: detail === undefined ? null : redactDetail(detail()),
  };
  events[area].push(entry);
  trimEvents(area);
}

/** 同じ失敗か（起きた場所・名前・文面・スタック・部品の位置が同じ） */
function sameFault(a: TraceFault, b: TraceFault): boolean {
  return (
    a.where === b.where &&
    a.name === b.name &&
    a.message === b.message &&
    a.stack === b.stack &&
    a.componentStack === b.componentStack
  );
}

/** 失敗を 1 件溜める。段階によらずいつも溜める。続けて同じ失敗なら 1 件にまとめて回数を数える */
export function traceFault(where: string, error: unknown, componentStack?: string | null): void {
  const top = describe(error);
  const fault: TraceFault = {
    at: new Date().toISOString(),
    where: redactText(where),
    name: top.name,
    message: top.message,
    stack: error instanceof Error && typeof error.stack === 'string' ? clip(error.stack) : null,
    causes: causesOf(error),
    componentStack:
      typeof componentStack === 'string' && componentStack.length > 0 ? clip(componentStack) : null,
  };
  const last = faults.at(-1);
  if (last !== undefined && sameFault(last, fault)) {
    faults[faults.length - 1] = { ...last, at: fault.at, count: (last.count ?? 1) + 1 };
    return;
  }
  faults.push(fault);
  if (faults.length > FAULT_CAPACITY) faults.splice(0, faults.length - FAULT_CAPACITY);
}

/** 失敗と出来事の写しを返す */
export function traceSnapshot(): TraceSnapshot {
  // 分野ごとの出来事を、起きた順に並べ直して 1 本にする（時刻は ISO なので文字で比べられる）
  const merged = TRACE_AREAS.flatMap((area) => events[area]).sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );
  return { levels, faults: [...faults], events: merged };
}

/** 失敗と出来事をすべて消す（段階はそのまま） */
export function clearTrace(): void {
  faults = [];
  events = { comfy: [], llm: [] };
}

/**
 * 値を文字にする。`String()` が投げる物（`Object.create(null)` など。文字に直す口が無い）でも投げない
 */
export function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function describe(value: unknown): TraceCause {
  if (value instanceof Error) {
    return { name: value.name, message: clip(value.message) };
  }
  return { name: typeof value, message: clip(safeString(value)) };
}

/** 原因の連なり（`cause`）。同じ物を 2 度たどらず、決めた深さで止める */
function causesOf(error: unknown): TraceCause[] {
  const seen = new Set<unknown>([error]);
  const causes: TraceCause[] = [];
  let current: unknown = error instanceof Error ? error.cause : undefined;
  while (current !== undefined && causes.length < CAUSE_DEPTH && !seen.has(current)) {
    seen.add(current);
    causes.push(describe(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return causes;
}

function clip(text: string): string {
  const redacted = redactText(text);
  return truncate(redacted, TEXT_MAX, { singleLine: false });
}

function redactDetail(detail: TraceDetail): TraceDetail {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail)) {
    out[key] = typeof value === 'string' ? clip(value) : value;
  }
  return out;
}

// ─────────────────────────────
// URL とパスの置き換え
// ─────────────────────────────

const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()[\]{}]+/gi;
/** Windows のドライブ（`C:\` `C:/`）と UNC（`\\server\share`） */
const WINDOWS_PATH_RE = /(?:\b[A-Za-z]:[\\/]|\\\\[^\s\\]+\\)[^\s"'<>|]*/g;
/** 利用者のファイルが置かれる POSIX の場所 */
const POSIX_PATH_RE =
  /(?<![\w.:/])\/(?:home|Users|mnt|root|media|srv|opt|data|var|tmp|private|Volumes)\/[^\s"'<>]*/g;

function ownOrigin(): string | null {
  const location = (globalThis as { location?: { origin?: unknown } }).location;
  return typeof location?.origin === 'string' && location.origin !== 'null'
    ? location.origin
    : null;
}

/** URL を種類だけの印にする。配信元（このアプリ自身）の URL はパスを残す（スタックトレースを読むため） */
function urlMark(url: string): string {
  const own = ownOrigin();
  if (own !== null && url.startsWith(`${own}/`)) return url.slice(own.length);
  let scheme = 'other';
  try {
    scheme = new URL(url).protocol.replace(/:$/, '');
  } catch {
    // 読めない URL も種類だけにする
  }
  const place =
    scheme === 'http' || scheme === 'https' || scheme === 'ws' || scheme === 'wss'
      ? isRemoteHost(url)
        ? 'remote'
        : 'private'
      : 'other';
  return `<url:${scheme}-${place}>`;
}

/** `Authorization` の値 */
const BEARER_RE = /\bBearer\s+[^\s"'<>]+/gi;
/** スキームの無い IPv4（ポート付きも） */
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g;
/** スキームの無いホスト名とポート（`localhost:8188`・`comfy.example.com:443`） */
const HOST_PORT_RE = /\b(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d{1,5}\b/gi;
/**
 * キーに見える長い文字列（英字と数字が混ざり 24 文字以上）。API キーの多くはこの形になる。
 * 実行の id（UUID）も当たるが、解析には要らない
 */
const TOKEN_RE = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g;

/**
 * 文面の中の URL・ファイルのパス・ホスト・キーに見える文字列を、種類だけの印に置き換える。
 * 型で拾えない物（打ち込んだ値そのもの）は、書き出すときに `scrubKnown` でも消す
 */
export function redactText(text: string): string {
  return text
    .replace(URL_RE, urlMark)
    .replace(BEARER_RE, 'Bearer <key>')
    .replace(WINDOWS_PATH_RE, '<path>')
    .replace(POSIX_PATH_RE, '<path>')
    .replace(IPV4_RE, '<host>')
    .replace(HOST_PORT_RE, '<host>')
    .replace(TOKEN_RE, '<token>');
}

/** これより短い値は探さない（ありふれた語まで消してしまう） */
const KNOWN_MIN_LENGTH = 4;

/**
 * 分かっている秘密（API キー・接続先の URL とホスト）を、文面からそのまま探して消す。
 * 型の置き換えをすり抜けた物（スキームの無い打ち間違いの URL・欄に貼ったキー）を拾うため
 */
export function scrubKnown(text: string, secrets: readonly string[]): string {
  const values = [...new Set(secrets.map((value) => value.trim()))]
    .filter((value) => value.length >= KNOWN_MIN_LENGTH)
    // 長い物から消す（URL を消す前にホストだけ消すと、URL の残りが残る）
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const value of values) out = out.split(value).join('<redacted>');
  return out;
}
