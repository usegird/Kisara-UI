import { finiteNumber, isRecord } from '@/lib/guards';

export type ColumnKey =
  'app' | 'appGap' | 'cards' | 'variablesGap' | 'variables' | 'queue' | 'chatSide';

export type SideColumnKey = Extract<ColumnKey, 'queue' | 'chatSide'>;

export type ColumnWidths = Readonly<Record<ColumnKey, number>>;

export const COLUMN_LIMITS: Readonly<Record<ColumnKey, { min: number; max: number }>> = {
  app: { min: 0, max: 1600 },
  appGap: { min: 0, max: 800 },
  cards: { min: 240, max: 900 },
  variablesGap: { min: 48, max: 1600 },
  variables: { min: 120, max: 640 },
  queue: { min: 0, max: 960 },
  chatSide: { min: 0, max: 960 },
};

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  app: 240,
  appGap: 10,
  cards: 424,
  variablesGap: 120,
  variables: 228,
  queue: 200,
  chatSide: 200,
};

export function resizeColumn(key: ColumnKey, width: number, delta: number): number {
  const { min, max } = COLUMN_LIMITS[key];

  return Math.round(Math.min(max, Math.max(min, width + delta)));
}

export function widenFromShown(width: number, shown: number, delta: number): number {
  return delta > 0 && shown > width ? shown - width + delta : delta;
}

export function normalizeColumnWidths(value: unknown): ColumnWidths {
  if (!isRecord(value)) return DEFAULT_COLUMN_WIDTHS;

  const keys = Object.keys(DEFAULT_COLUMN_WIDTHS) as ColumnKey[];

  return keys.reduce<Record<ColumnKey, number>>(
    (acc, key) => {
      const width = finiteNumber(value[key]);
      acc[key] = width === null ? DEFAULT_COLUMN_WIDTHS[key] : resizeColumn(key, width, 0);
      return acc;
    },
    { ...DEFAULT_COLUMN_WIDTHS },
  );
}
