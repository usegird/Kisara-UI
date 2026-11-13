import { clamp } from '@/lib/clamp';

// ─────────────────────────────
// 別々に送る 2 つの列で、両端を同じ高さに揃える送り量。
// 送れる量には上限があるので、**押した高さに最も近い、両方とも届く高さ**で揃える。
// ─────────────────────────────

/** 1 つの列の今の送り位置と、送れる余地 */
export interface ScrollRoom {
  /** 今の送り位置（scrollTop） */
  readonly top: number;
  /** 送れる最大（scrollHeight - clientHeight） */
  readonly max: number;
}

/** 2 つの列それぞれを送る量 */
interface AlignScroll {
  /** 左の列を送る量（正で下へ送る） */
  readonly first: number;
  /** 右の列を送る量 */
  readonly second: number;
}

/** 揃える高さ */
export interface AlignHeights {
  /** 線の始まりの今の高さ */
  readonly from: number;
  /** 線の終わりの今の高さ */
  readonly to: number;
  /** 揃えたい高さ（押した高さ） */
  readonly at: number;
}

/**
 * 線の両端が同じ高さに来るよう、2 つの列を送る量を求める。
 * 両方が届く高さが無ければ、それぞれ届くところまで寄せる
 */
export function alignScroll(
  { from, to, at }: AlignHeights,
  first: ScrollRoom,
  second: ScrollRoom,
): AlignScroll {
  // 送ると中身は上へ動く。上へは残りの余地まで、下へは今の送り位置まで
  const firstRange = [from - (first.max - first.top), from + first.top] as const;
  const secondRange = [to - (second.max - second.top), to + second.top] as const;

  const low = Math.max(firstRange[0], secondRange[0]);
  const high = Math.min(firstRange[1], secondRange[1]);

  if (low <= high) {
    const y = clamp(at, low, high);
    return { first: from - y, second: to - y };
  }

  return {
    first: from - clamp(at, ...firstRange),
    second: to - clamp(at, ...secondRange),
  };
}
