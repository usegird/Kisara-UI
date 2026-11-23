const TEMP_TYPE = 'temp';

export type TempProbe = 'present' | 'gone' | 'unknown';

const goneUntil = new Map<string, number>();

export function isKnownGone(baseUrl: string, type: string, until: number | undefined): boolean {
  if (type !== TEMP_TYPE || until === undefined) return false;
  const cutoff = goneUntil.get(baseUrl);
  return cutoff !== undefined && until <= cutoff;
}

export function noteGone(baseUrl: string, type: string, until: number | undefined): void {
  if (type !== TEMP_TYPE || until === undefined) return;
  goneUntil.set(baseUrl, Math.max(goneUntil.get(baseUrl) ?? until, until));
}

export function forgetGoneTemps(): void {
  goneUntil.clear();
}

export async function probeBoundary(
  count: number,
  probe: (index: number) => Promise<TempProbe>,
): Promise<{ readonly probed: ReadonlySet<number>; readonly firstPresent: number | null }> {
  const probed = new Set<number>();
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    probed.add(middle);
    const result = await probe(middle);
    if (result === 'unknown') return { probed, firstPresent: null };
    if (result === 'gone') low = middle + 1;
    else high = middle;
  }
  return { probed, firstPresent: low };
}
