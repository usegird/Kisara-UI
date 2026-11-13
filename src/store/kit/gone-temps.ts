// ─────────────────────────────
// 消えたと分かっている `temp` の境目。ComfyUI は再起動のときに `temp` をまとめて消すので、ある実行の
// `temp` が無ければ、それより前に終わった実行の `temp` も無い。境目より前のものは取りに行かない。
// 接続先ごとにこの画面を開いている間だけ持つ（端末には残さない）。
// ─────────────────────────────

/** 再起動で消える出力の種別 */
const TEMP_TYPE = 'temp';

/** 1 枚を読んだ結果。`unknown` は応答が無い・読めない（境目を決める材料にしない） */
export type TempProbe = 'present' | 'gone' | 'unknown';

/** 接続先 → この時刻（接続先の時計）までに終わった実行の `temp` は無い */
const goneUntil = new Map<string, number>();

/** 消えたと分かっている `temp` か。実行の終わりが分からなければ false */
export function isKnownGone(baseUrl: string, type: string, until: number | undefined): boolean {
  if (type !== TEMP_TYPE || until === undefined) return false;
  const cutoff = goneUntil.get(baseUrl);
  return cutoff !== undefined && until <= cutoff;
}

/** 無かった `temp` の実行の終わりを覚える（境目は進むだけ） */
export function noteGone(baseUrl: string, type: string, until: number | undefined): void {
  if (type !== TEMP_TYPE || until === undefined) return;
  goneUntil.set(baseUrl, Math.max(goneUntil.get(baseUrl) ?? until, until));
}

/** 覚えた境目を忘れる（試験用） */
export function forgetGoneTemps(): void {
  goneUntil.clear();
}

/**
 * 古い順に並べた `temp` から、境目（最初に有るもの）を半分ずつ読んで探す。
 * 無いものは前に、有るものは後ろに並ぶ前提（再起動はそれより前をまとめて消す）なので、
 * 全部を読まずに済む。読んだ位置の結果と、境目の位置（読めないものに当たったら null）を返す
 */
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
