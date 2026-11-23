export interface LeakWatch {
  readonly watch: (target: object) => void;
  readonly survivors: () => Promise<number>;
}

export const LEAK_ROUNDS = 10;

export const LEAK_ALLOWANCE = 2;

const SETTLE_MS = 20;

function isCollector(value: unknown): value is () => void {
  return typeof value === 'function';
}

export async function collectGarbage(): Promise<void> {
  const gc: unknown = Reflect.get(globalThis, 'gc');
  if (!isCollector(gc)) {
    throw new Error('GC を呼べません（vite.config.ts の test.execArgv に --expose-gc が要る）');
  }
  for (let round = 0; round < 2; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    gc();
  }
}

export function leakWatch(): LeakWatch {
  const refs: WeakRef<object>[] = [];
  return {
    watch: (target) => {
      refs.push(new WeakRef(target));
    },
    survivors: async () => {
      await collectGarbage();
      return refs.filter((ref) => ref.deref() !== undefined).length;
    },
  };
}
