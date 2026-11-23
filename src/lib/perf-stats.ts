import { isRecord, isUnknownArray } from '@/lib/guards';

interface PerfStat {
  readonly count: number;
  readonly totalMs: number;
  readonly maxMs: number;
}

const ledger = new Map<string, { count: number; totalMs: number; maxMs: number }>();

export function recordStat(name: string, durationMs = 0): void {
  const entry = ledger.get(name);
  if (entry) {
    entry.count += 1;
    entry.totalMs += durationMs;
    entry.maxMs = Math.max(entry.maxMs, durationMs);
    return;
  }
  ledger.set(name, { count: 1, totalMs: durationMs, maxMs: durationMs });
}

export function statsSnapshot(): Record<string, PerfStat> {
  const entries = [...ledger.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([name, entry]) => [name, { ...entry }]));
}

export function statCount(name: string): number {
  return ledger.get(name)?.count ?? 0;
}

export function resetStats(): void {
  ledger.clear();
}

const parents = new Map<string, string | null>();

export function recordProbeParent(id: string, parent: string | null): void {
  if (!parents.has(id)) parents.set(id, parent);
}

export function probeParents(): ReadonlyMap<string, string | null> {
  return new Map(parents);
}

export interface StatRow {
  readonly name: string;
  readonly depth: number;
  readonly stat: PerfStat;
}

function probeOf(name: string): string | null {
  const match = /^(?:mount|render):(.+)$/.exec(name);
  return match?.[1] ?? null;
}

export function statRows(
  snapshot: Readonly<Record<string, PerfStat>>,
  parentOf: ReadonlyMap<string, string | null>,
): StatRow[] {
  const byProbe = new Map<string, [string, PerfStat][]>();
  const others: StatRow[] = [];
  for (const [name, stat] of Object.entries(snapshot)) {
    const probe = probeOf(name);
    if (probe === null) {
      others.push({ name, depth: 0, stat });
      continue;
    }
    byProbe.set(probe, [...(byProbe.get(probe) ?? []), [name, stat]]);
  }

  const children = new Map<string | null, Set<string>>();
  const place = (probe: string, seen: Set<string>): void => {
    if (seen.has(probe)) return;
    seen.add(probe);
    const parent = parentOf.get(probe) ?? null;
    if (parent !== null) place(parent, seen);
    children.set(parent, (children.get(parent) ?? new Set()).add(probe));
  };
  const seen = new Set<string>();
  for (const probe of byProbe.keys()) place(probe, seen);

  const rows: StatRow[] = [];
  const walk = (parent: string | null, depth: number): void => {
    for (const probe of [...(children.get(parent) ?? [])].sort()) {
      const own = (byProbe.get(probe) ?? []).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      for (const [name, stat] of own) rows.push({ name, depth, stat });
      walk(probe, depth + 1);
    }
  };
  walk(null, 0);
  return [...rows, ...others];
}

const LONG_FRAME = 'long-animation-frame';
const LONG_FRAME_MS = 50;

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function frameWork(entry: unknown): number {
  if (!isRecord(entry)) return 0;
  const scripts = isUnknownArray(entry.scripts)
    ? entry.scripts.reduce<number>(
        (sum, script) => sum + (isRecord(script) ? numberOf(script.duration) : 0),
        0,
      )
    : 0;
  const renderStart = numberOf(entry.renderStart);
  const end = numberOf(entry.startTime) + numberOf(entry.duration);
  return scripts + (renderStart > 0 ? Math.max(0, end - renderStart) : 0);
}

export function watchLongFrames(): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {};
  if (!PerformanceObserver.supportedEntryTypes.includes(LONG_FRAME)) return () => {};

  const doc = globalThis.document;
  let shownAt = 0;
  const onVisibility = (): void => {
    if (doc.visibilityState === 'visible') shownAt = performance.now();
  };
  doc.addEventListener('visibilitychange', onVisibility);

  const observer = new PerformanceObserver((list) => {
    if (doc.visibilityState !== 'visible') return;
    for (const entry of list.getEntries()) {
      if (entry.startTime < shownAt) continue;
      if (frameWork(entry.toJSON()) > LONG_FRAME_MS) recordStat('frame:long', entry.duration);
    }
  });
  observer.observe({ type: LONG_FRAME });
  return () => {
    observer.disconnect();
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}

export interface HeapUsage {
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly limitBytes: number;
}

export function heapUsage(): HeapUsage | null {
  const memory: unknown = Reflect.get(performance, 'memory');
  if (!isRecord(memory)) return null;
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = memory;
  if (
    typeof usedJSHeapSize !== 'number' ||
    typeof totalJSHeapSize !== 'number' ||
    typeof jsHeapSizeLimit !== 'number'
  ) {
    return null;
  }
  return { usedBytes: usedJSHeapSize, totalBytes: totalJSHeapSize, limitBytes: jsHeapSizeLimit };
}
