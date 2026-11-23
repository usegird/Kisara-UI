import { safeString } from '@/lib/trace';

export function reportFault(where: string | FaultPlace, error: unknown): void {
  const wrapped =
    typeof where === 'string'
      ? new Error(`${where}: ${messageOf(error)}`, { cause: error })
      : new PlacedFault(where, error);

  const report = (globalThis as { reportError?: (error: unknown) => void }).reportError;
  if (typeof report === 'function') {
    report(wrapped);
    return;
  }
  console.error(wrapped);
}

export interface FaultPlace {
  readonly code: string;
  readonly params: Readonly<Record<string, string>>;
}

export class PlacedFault extends Error {
  readonly place: FaultPlace;

  constructor(place: FaultPlace, cause: unknown) {
    super(`${place.code}: ${messageOf(cause)}`, { cause });
    this.name = 'PlacedFault';
    this.place = place;
  }
}

export function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(safeString(value));
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
