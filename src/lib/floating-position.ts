import { finiteNumber, isRecord } from '@/lib/guards';

// ─────────────────────────────
// 浮かせた枠の置き場所。端末に残す値なので、壊れた保存値は「指定なし」に落とす。
// ─────────────────────────────

/**
 * 浮かせた枠の、左端と下端からの距離（px）。
 * 既定の置き場所が左下寄りなので、下から測ると窓の高さが変わっても同じ場所に留まる
 */
export interface FloatingPosition {
  readonly left: number;
  readonly bottom: number;
}

/** 保存値の読み直し。形が違えば null（既定の置き場所に任せる） */
export function normalizeFloatingPosition(value: unknown): FloatingPosition | null {
  if (!isRecord(value)) return null;

  const left = finiteNumber(value.left);
  const bottom = finiteNumber(value.bottom);
  if (left === null || bottom === null) return null;

  return { left: Math.max(0, Math.round(left)), bottom: Math.max(0, Math.round(bottom)) };
}

/** 動かした量（右・下が正）を足す。枠の外（負の距離）には出さない */
export function moveFloating(position: FloatingPosition, dx: number, dy: number): FloatingPosition {
  return {
    left: Math.max(0, Math.round(position.left + dx)),
    bottom: Math.max(0, Math.round(position.bottom - dy)),
  };
}
