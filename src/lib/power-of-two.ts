// ─────────────────────────────
// 2 の累乗への繰り上げ・繰り下げ（max_tokens の上下）。
// ─────────────────────────────

/** 上（1）なら次の 2 の累乗、下（-1）なら手前の 2 の累乗（1 より下げない） */
export function stepPowerOfTwo(value: number, direction: 1 | -1): number {
  if (direction > 0) return 2 ** (Math.floor(Math.log2(Math.max(value, 1))) + 1);
  return Math.max(1, 2 ** (Math.ceil(Math.log2(Math.max(value, 1))) - 1));
}
