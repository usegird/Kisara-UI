interface TabScoped {
  readonly capture: () => unknown;
  readonly restore: (saved: unknown) => void;
}

const entries = new Map<string, TabScoped>();

export function registerTabScoped(key: string, scoped: TabScoped): void {
  entries.set(key, scoped);
}

interface TabScopedValue<T> {
  readonly current: () => T | null;
  readonly isValue: (saved: unknown) => saved is T;
  readonly open: (value: T) => void;
  readonly close: () => void;
}

export function registerTabScopedValue<T>(key: string, scoped: TabScopedValue<T>): void {
  registerTabScoped(key, {
    capture: () => scoped.current() ?? undefined,
    restore: (saved) => {
      if (scoped.isValue(saved)) scoped.open(saved);
      else if (scoped.current() !== null) scoped.close();
    },
  });
}

export function captureTabScoped(): Readonly<Record<string, unknown>> {
  const saved: Record<string, unknown> = {};
  for (const [key, scoped] of entries) {
    const value = scoped.capture();
    if (value !== undefined) saved[key] = value;
  }
  return saved;
}

export function restoreTabScoped(saved: Readonly<Record<string, unknown>> | undefined): void {
  for (const [key, scoped] of entries) scoped.restore(saved?.[key]);
}
