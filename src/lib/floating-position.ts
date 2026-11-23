import { finiteNumber, isRecord } from '@/lib/guards';

export interface FloatingPosition {
  readonly left: number;
  readonly bottom: number;
}

export function normalizeFloatingPosition(value: unknown): FloatingPosition | null {
  if (!isRecord(value)) return null;

  const left = finiteNumber(value.left);
  const bottom = finiteNumber(value.bottom);
  if (left === null || bottom === null) return null;

  return { left: Math.max(0, Math.round(left)), bottom: Math.max(0, Math.round(bottom)) };
}

export function moveFloating(position: FloatingPosition, dx: number, dy: number): FloatingPosition {
  return {
    left: Math.max(0, Math.round(position.left + dx)),
    bottom: Math.max(0, Math.round(position.bottom - dy)),
  };
}
