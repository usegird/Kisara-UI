import { isRecord } from '@/lib/guards';

export interface Safeguards {
  readonly repeatFailureLimit: number;
  readonly repeatMinIntervalMs: number;
  readonly repeatMaxRuns: number;
  readonly llmRequestInputMax: number;
  readonly llmWindowMinutes: number;
  readonly llmWindowOutputLimit: number;
  readonly llmWindowInputLimit: number;
  readonly llmSilentMinutes: number;
  readonly toolAutoRunMax: number;
}

export const DEFAULT_SAFEGUARDS: Safeguards = {
  repeatFailureLimit: 5,
  repeatMinIntervalMs: 1000,
  repeatMaxRuns: 1000,
  llmRequestInputMax: 524_288,
  llmWindowMinutes: 30,
  llmWindowOutputLimit: 90_000,
  llmWindowInputLimit: 1_000_000,
  llmSilentMinutes: 5,
  toolAutoRunMax: 5,
};

export const SAFEGUARD_KEYS = Object.keys(DEFAULT_SAFEGUARDS) as readonly (keyof Safeguards)[];

export function normalizeSafeguards(raw: unknown): Safeguards {
  const saved = isRecord(raw) ? raw : {};
  const pick = (key: keyof Safeguards): number => {
    const value = saved[key];
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : DEFAULT_SAFEGUARDS[key];
  };
  const result: { -readonly [K in keyof Safeguards]: number } = { ...DEFAULT_SAFEGUARDS };
  for (const key of SAFEGUARD_KEYS) result[key] = pick(key);
  return result;
}

export function safeguardOverrides(safeguards: Safeguards): Partial<Safeguards> | undefined {
  const changed = SAFEGUARD_KEYS.filter((key) => safeguards[key] !== DEFAULT_SAFEGUARDS[key]);
  if (changed.length === 0) return undefined;
  return Object.fromEntries(changed.map((key) => [key, safeguards[key]]));
}
