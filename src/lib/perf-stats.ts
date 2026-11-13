import { isRecord, isUnknownArray } from '@/lib/guards';

// ─────────────────────────────
// 回数の台帳。描画・ストアの更新・長いフレームを名前ごとに足し込む。
// ─────────────────────────────

/**
 * 1 つの名前の足し込み。**1 回ごとの記録は残さない**（残すと台帳そのものが重い経路に乗り、
 * 測る値をゆがめる）。時間は計測用ビルドの値だけが結論に使える
 */
interface PerfStat {
  readonly count: number;
  /** 合計の時間（ミリ秒）。時間を持たない項目は 0 */
  readonly totalMs: number;
  readonly maxMs: number;
}

const ledger = new Map<string, { count: number; totalMs: number; maxMs: number }>();

/** 名前の回数を 1 足し、時間があれば合計と最大に足し込む */
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

/** 名前の順に並べた写し。台帳そのものは渡さない */
export function statsSnapshot(): Record<string, PerfStat> {
  const entries = [...ledger.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([name, entry]) => [name, { ...entry }]));
}

/** その名前の回数。まだ一度も数えていなければ 0 */
export function statCount(name: string): number {
  return ledger.get(name)?.count ?? 0;
}

/** 台帳を空にする（範囲の入れ子の控えは残す） */
export function resetStats(): void {
  ledger.clear();
}

// ─────────────────────────────
// 計測の範囲の入れ子（表の字下げに使う）。範囲が描かれたときに外側の範囲を控える。
// 回数ではないので、台帳を空にしても残す。
// ─────────────────────────────

const parents = new Map<string, string | null>();

/** 範囲 `id` の外側の範囲を控える。外側が無ければ null。最初に控えたものを使う */
export function recordProbeParent(id: string, parent: string | null): void {
  if (!parents.has(id)) parents.set(id, parent);
}

/** 控えた入れ子の写し */
export function probeParents(): ReadonlyMap<string, string | null> {
  return new Map(parents);
}

/** 表の 1 行。`depth` は字下げの段（範囲の外の項目は 0） */
export interface StatRow {
  readonly name: string;
  readonly depth: number;
  readonly stat: PerfStat;
}

/** `mount:<範囲>` / `render:<範囲>` の範囲の名前。範囲の項目でなければ null */
function probeOf(name: string): string | null {
  const match = /^(?:mount|render):(.+)$/.exec(name);
  return match?.[1] ?? null;
}

/**
 * 台帳を表の並びにする。範囲の項目は入れ子の順（外側の直後に内側、同じ段は名前の順）に並べ、
 * 1 つの範囲の中は mount・render の順。範囲に属さない項目は最後に名前の順で並べる
 */
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

  // 回数の無い外側の範囲も、内側を辿るために木へ入れる
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

// ─────────────────────────────
// 長いフレーム（Long Animation Frames）。Chromium 系にしか無いので、無ければ何もしない
// ─────────────────────────────

const LONG_FRAME = 'long-animation-frame';
const LONG_FRAME_MS = 50;

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * フレームの中で実際に処理していた時間（スクリプト＋描画）。
 * 画面が裏に隠れている間はフレームが間引かれ、何もしていなくても長いフレームとして届く
 * （処理 0ms、描画待ちだけで 700ms 以上）ので、長さではなくこちらで判定する。
 * 型定義に無い項目なので、中身を確かめて読む
 */
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

/**
 * 処理が 50ms を超えたフレームの長さを `frame:long` に足す。止める関数を返す。
 * 画面が隠れていた間にかかったフレームは数えない（表に戻した瞬間のフレームは、
 * 隠れていた間の描画待ちまで含んで何秒にもなる）
 */
export function watchLongFrames(): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {};
  if (!PerformanceObserver.supportedEntryTypes.includes(LONG_FRAME)) return () => {};

  const doc = globalThis.document;
  /** 最後に表へ戻った時刻。これより前に始まったフレームは隠れていた間にかかっている */
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

// ─────────────────────────────
// JS ヒープの量。Chromium だけの非標準の `performance.memory` を読む。台帳ではなく、読んだ時点の量。
// ─────────────────────────────

/** 読んだ時点の JS ヒープの量。画像のデコード・DOM・GPU の分は入らず、値は粗く丸められる */
export interface HeapUsage {
  /** 使っている量（バイト） */
  readonly usedBytes: number;
  /** 確保している量（バイト） */
  readonly totalBytes: number;
  /** 上限（バイト） */
  readonly limitBytes: number;
}

/** 今の JS ヒープの量。読めない環境（Chromium 以外・テスト）では null */
export function heapUsage(): HeapUsage | null {
  // 型の定義に無い非標準の値なので、unknown で受けて確かめる
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
