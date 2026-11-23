import { normalizeInRange } from '@/lib/clamp';

export const DEFAULT_SIDE_PANEL_HEIGHT = 200;
export const MIN_SIDE_PANEL_HEIGHT = 122;
export const MAX_SIDE_PANEL_HEIGHT = 1200;

export function normalizeSidePanelHeight(value: unknown): number {
  return normalizeInRange(
    value,
    { initial: DEFAULT_SIDE_PANEL_HEIGHT, min: MIN_SIDE_PANEL_HEIGHT, max: MAX_SIDE_PANEL_HEIGHT },
    { round: true },
  );
}
