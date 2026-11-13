import { create } from 'zustand';

import { isRecord } from '@/lib/guards';
import type { ChatTable } from '@/store/persist/chat-repo';
import { warnUnsaved } from '@/store/use-storage-warnings-store';

// ─────────────────────────────
// 1 件ずつの保存物を、書く前に照合する。置き場の 1 件の最後に変えた
// 時刻が、このタブが持っていた版と違う（ほかのタブで直した）か、無い（ほかのタブで消した）なら書かずに
// 知らせる。知らせは `WriteConflictToasts` が出し、「このタブの内容で上書き」で今の内容を書く。
// ─────────────────────────────

/** ほかのタブで変わった・消えた 1 件の知らせ */
interface WriteConflict {
  /** 表と id（`<表>:<id>`） */
  readonly key: string;
  readonly name: string;
  /** ほかのタブで直した／消した */
  readonly kind: 'changed' | 'removed';
}

interface WriteConflictsState {
  readonly conflicts: readonly WriteConflict[];
  /** 知らせを閉じた。書かないまま外し、次に直したときにもう一度照合する */
  readonly close: (key: string) => void;
  /** 照合せずに、今のこのタブの内容を書く */
  readonly overwrite: (key: string) => Promise<void>;
}

interface Pending {
  readonly table: ChatTable;
  readonly id: string;
  readonly latest: () => unknown;
}

/** 知らせている 1 件の書き先（上書きを押したときに使う。状態に置かない） */
const pending = new Map<string, Pending>();
/** 同じ 1 件の書き込みを 1 本ずつ順にする */
const chains = new Map<string, Promise<void>>();

export const useWriteConflictsStore = create<WriteConflictsState>()((set, get) => ({
  conflicts: [],

  close: (key) => {
    pending.delete(key);
    set({ conflicts: get().conflicts.filter((item) => item.key !== key) });
  },

  overwrite: async (key) => {
    const target = pending.get(key);
    get().close(key);
    if (target === undefined) return;
    const value = target.latest();
    if (value === undefined) return;
    await enqueue(key, () => target.table.put(target.id, value));
  },
}));

/**
 * 書けなければ警告する（保存した持ち物は読み込み直すと消えるため）
 */
function enqueue(key: string, task: () => Promise<void>): Promise<void> {
  const next = (chains.get(key) ?? Promise.resolve()).then(task).catch(() => {
    warnUnsaved('library');
  });
  chains.set(key, next);
  return next;
}

/** 置き場の 1 件が、このタブが持っていた版のままか。違えば何が起きたか */
function conflictOf(current: unknown, expected: number): WriteConflict['kind'] | null {
  if (current === undefined) return 'removed';
  const at = isRecord(current) && typeof current.updatedAt === 'number' ? current.updatedAt : null;
  return at === expected ? null : 'changed';
}

/** 照合してから書く 1 件の書き込み */
export interface CheckedWrite {
  readonly table: ChatTable;
  /** 表の名前（知らせの鍵に使う） */
  readonly scope: string;
  readonly id: string;
  readonly value: unknown;
  /** このタブが持っていた版の時刻。新しく足す 1 件・控えから戻す 1 件は null（照合しない） */
  readonly expected: number | null;
  /** 知らせに出す名前 */
  readonly name: string;
  /** 上書きを押したときに書く、そのときのこのタブの内容（消していれば undefined） */
  readonly latest: () => unknown;
}

/** 照合してから書く。書けなくても投げない（この画面の中では使える） */
export function writeChecked(write: CheckedWrite): Promise<void> {
  const key = `${write.scope}:${write.id}`;
  return enqueue(key, async () => {
    // 知らせている 1 件は、押されるまで書かない（押したときに最後の内容を書く）
    if (pending.has(key)) return;
    if (write.expected !== null) {
      const kind = conflictOf(await write.table.get(write.id), write.expected);
      if (kind !== null) {
        pending.set(key, { table: write.table, id: write.id, latest: write.latest });
        const { conflicts } = useWriteConflictsStore.getState();
        useWriteConflictsStore.setState({
          conflicts: [...conflicts, { key, name: write.name, kind }],
        });
        return;
      }
    }
    await write.table.put(write.id, write.value);
  });
}

/**
 * 1 件を消す。照合はしないが、同じ 1 件の書き込みの後ろに並べる（先に足した書き込みが後から
 * 届いて、消した 1 件を戻さない）。その 1 件の知らせも外す。消せなくても投げない
 */
export function deleteInOrder(table: ChatTable, scope: string, id: string): Promise<void> {
  const key = `${scope}:${id}`;
  useWriteConflictsStore.getState().close(key);
  return enqueue(key, () => table.delete(id));
}
