const KEY_SEPARATOR = '\u0000';

export function setOwn<T>(target: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function ownOr<T>(target: Record<string, T>, key: string, make: () => T): T {
  if (Object.hasOwn(target, key)) return target[key] as T;
  const value = make();
  setOwn(target, key, value);
  return value;
}

export function omitKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

export function compositeKey(...parts: readonly string[]): string {
  return parts.join(KEY_SEPARATOR);
}
