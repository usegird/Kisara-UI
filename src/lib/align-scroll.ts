import { clamp } from '@/lib/clamp';

export interface ScrollRoom {
  readonly top: number;
  readonly max: number;
}

interface AlignScroll {
  readonly first: number;
  readonly second: number;
}

export interface AlignHeights {
  readonly from: number;
  readonly to: number;
  readonly at: number;
}

export function alignScroll(
  { from, to, at }: AlignHeights,
  first: ScrollRoom,
  second: ScrollRoom,
): AlignScroll {
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
