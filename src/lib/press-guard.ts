export const PRESS_GUARD_MS = 300;

export function createPressGuard(
  ms: number = PRESS_GUARD_MS,
): (key: string, now?: number) => boolean {
  const accepted = new Map<string, number>();
  return (key, now = Date.now()) => {
    const last = accepted.get(key);
    if (last !== undefined && now - last < ms && now >= last) return false;
    accepted.set(key, now);
    return true;
  };
}

const accept = createPressGuard();

export function guardPress<A extends unknown[]>(
  key: string,
  handler: (...args: A) => void,
): (...args: A) => void {
  return (...args) => {
    if (accept(key)) handler(...args);
  };
}
