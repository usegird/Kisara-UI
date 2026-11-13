import { MEGABYTE } from '@/lib/file-size';

// ─────────────────────────────
// 画面の中だけに持つ大きな物（結果の画像の中身・`/history` の 1 件分）の、合わせた量の上限。
// 持つ側は自分を登録し、足したら `trimHeld` を呼ぶ（ストア同士が読み合わないよう、登録された口だけを知る）。
// ─────────────────────────────

/** 合わせて持つ量の上限（MB の目安） */
const MEMORY_BUDGET_MEGABYTES = 512;
/** 合わせて持つ量の上限（バイトの目安） */
const MEMORY_BUDGET = MEMORY_BUDGET_MEGABYTES * MEGABYTE;

/** 手放せる 1 件 */
interface HeldItem {
  readonly key: string;
  readonly bytes: number;
  /** 古さ（epoch ミリ秒）。小さいものから手放す */
  readonly order: number;
}

/** 大きな物を持つ側の口。持っている物を並べ、言われた物を手放す */
interface MemoryHolder {
  readonly held: () => readonly HeldItem[];
  readonly release: (keys: ReadonlySet<string>) => void;
}

const holders = new Map<string, MemoryHolder>();

/** 持つ側を登録する（同じ名前は置き換える。テストで差し替えるため） */
export function registerHolder(name: string, holder: MemoryHolder): void {
  holders.set(name, holder);
}

/** 上限を超える分を古い方から選ぶ（純関数） */
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

/** 登録された物を合わせて数え、上限を超える分を古い方から手放す */
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
