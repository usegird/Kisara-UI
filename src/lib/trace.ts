import { isRecord } from '@/lib/guards';
import { isRemoteHost } from '@/lib/remote-host';
import { truncate } from '@/lib/text';

export const TRACE_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type TraceLevel = (typeof TRACE_LEVELS)[number];

export const TRACE_AREAS = ['comfy', 'llm'] as const;
export type TraceArea = (typeof TRACE_AREAS)[number];

export type TraceLevels = Readonly<Record<TraceArea, TraceLevel>>;

export const DEFAULT_TRACE_LEVELS: TraceLevels = { comfy: 'error', llm: 'error' };

function isTraceLevel(value: unknown): value is TraceLevel {
  return typeof value === 'string' && (TRACE_LEVELS as readonly string[]).includes(value);
}

export function parseTraceLevels(raw: unknown): TraceLevels {
  const saved = isRecord(raw) ? raw : {};
  const read = (area: TraceArea): TraceLevel => {
    const value = saved[area];
    return isTraceLevel(value) ? value : DEFAULT_TRACE_LEVELS[area];
  };
  return { comfy: read('comfy'), llm: read('llm') };
}

export function storedTraceLevels(value: TraceLevels): TraceLevels {
  const keep = (level: TraceLevel): TraceLevel => (level === 'debug' ? 'warn' : level);
  return { comfy: keep(value.comfy), llm: keep(value.llm) };
}

export const FAULT_CAPACITY = 50;

export const EVENT_CAPACITY: Readonly<Record<TraceLevel, number>> = {
  error: 0,
  warn: 200,
  info: 500,
  debug: 2000,
};

const CAUSE_DEPTH = 5;
const TEXT_MAX = 4000;

export type TraceDetail = Readonly<Record<string, string | number | boolean | null>>;

interface TraceCause {
  readonly name: string;
  readonly message: string;
}

interface TraceFault {
  readonly at: string;
  readonly where: string;
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
  readonly causes: readonly TraceCause[];
  readonly componentStack: string | null;
  readonly count?: number;
}

interface TraceEvent {
  readonly at: string;
  readonly area: TraceArea;
  readonly level: TraceLevel;
  readonly kind: string;
  readonly detail: TraceDetail | null;
}

interface TraceSnapshot {
  readonly levels: TraceLevels;
  readonly faults: readonly TraceFault[];
  readonly events: readonly TraceEvent[];
}

let levels: TraceLevels = DEFAULT_TRACE_LEVELS;
let faults: TraceFault[] = [];
let events: Record<TraceArea, TraceEvent[]> = { comfy: [], llm: [] };

function trimEvents(area: TraceArea): void {
  const list = events[area];
  const capacity = EVENT_CAPACITY[levels[area]];
  if (list.length > capacity) list.splice(0, list.length - capacity);
}

export function setTraceLevels(next: TraceLevels): void {
  levels = next;
  for (const area of TRACE_AREAS) trimEvents(area);
}

export function traceEnabled(area: TraceArea, level: TraceLevel): boolean {
  return TRACE_LEVELS.indexOf(level) <= TRACE_LEVELS.indexOf(levels[area]);
}

export function traceVerbose(value: TraceLevels = levels): boolean {
  return TRACE_AREAS.some((area) => value[area] === 'debug');
}

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

function sameFault(a: TraceFault, b: TraceFault): boolean {
  return (
    a.where === b.where &&
    a.name === b.name &&
    a.message === b.message &&
    a.stack === b.stack &&
    a.componentStack === b.componentStack
  );
}

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

export function traceSnapshot(): TraceSnapshot {
  const merged = TRACE_AREAS.flatMap((area) => events[area]).sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );
  return { levels, faults: [...faults], events: merged };
}

export function clearTrace(): void {
  faults = [];
  events = { comfy: [], llm: [] };
}

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

const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()[\]{}]+/gi;
const WINDOWS_PATH_RE = /(?:\b[A-Za-z]:[\\/]|\\\\[^\s\\]+\\)[^\s"'<>|]*/g;
const POSIX_PATH_RE =
  /(?<![\w.:/])\/(?:home|Users|mnt|root|media|srv|opt|data|var|tmp|private|Volumes)\/[^\s"'<>]*/g;

function ownOrigin(): string | null {
  const location = (globalThis as { location?: { origin?: unknown } }).location;
  return typeof location?.origin === 'string' && location.origin !== 'null'
    ? location.origin
    : null;
}

function urlMark(url: string): string {
  const own = ownOrigin();
  if (own !== null && url.startsWith(`${own}/`)) return url.slice(own.length);
  let scheme = 'other';
  try {
    scheme = new URL(url).protocol.replace(/:$/, '');
  } catch {
  }
  const place =
    scheme === 'http' || scheme === 'https' || scheme === 'ws' || scheme === 'wss'
      ? isRemoteHost(url)
        ? 'remote'
        : 'private'
      : 'other';
  return `<url:${scheme}-${place}>`;
}

const BEARER_RE = /\bBearer\s+[^\s"'<>]+/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g;
const HOST_PORT_RE = /\b(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d{1,5}\b/gi;
const TOKEN_RE = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g;

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

const KNOWN_MIN_LENGTH = 4;

export function scrubKnown(text: string, secrets: readonly string[]): string {
  const values = [...new Set(secrets.map((value) => value.trim()))]
    .filter((value) => value.length >= KNOWN_MIN_LENGTH)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const value of values) out = out.split(value).join('<redacted>');
  return out;
}
