import { MEGABYTE } from '@/lib/file-size';

const MEMORY_BUDGET_MEGABYTES = 512;
const MEMORY_BUDGET = MEMORY_BUDGET_MEGABYTES * MEGABYTE;

interface HeldItem {
  readonly key: string;
  readonly bytes: number;
  readonly order: number;
}

interface MemoryHolder {
  readonly held: () => readonly HeldItem[];
  readonly release: (keys: ReadonlySet<string>) => void;
}

const holders = new Map<string, MemoryHolder>();

export function registerHolder(name: string, holder: MemoryHolder): void {
  holders.set(name, holder);
}

function overBudget(items: readonly HeldItem[], budget: number): HeldItem[] {
  let total = items.reduce((sum, item) => sum + item.bytes, 0);
  const released: HeldItem[] = [];
  for (const item of [...items].sort((a, b) => a.order - b.order)) {
    if (total <= budget) break;
    released.push(item);
    total -= item.bytes;
  }
  return released;
}

export function trimHeld(budget: number = MEMORY_BUDGET): void {
  const all = [...holders].flatMap(([name, holder]) =>
    holder.held().map((item) => ({ name, item })),
  );
  const released = new Set(
    overBudget(
      all.map(({ item }) => item),
      budget,
    ),
  );
  if (released.size === 0) return;
  for (const [name, holder] of holders) {
    const keys = new Set(
      all.filter((held) => held.name === name && released.has(held.item)).map((h) => h.item.key),
    );
    if (keys.size > 0) holder.release(keys);
  }
}
