import { setOwn } from '@/lib/own-key';
import type { AppStoreName } from '@/store/persist/app-db';
import { indexedDbTable, memoryTable, type ChatTable } from '@/store/persist/chat-repo';
import { deleteInOrder, writeChecked } from '@/store/use-write-conflicts-store';

// ─────────────────────────────
// 1 件ずつ置く一覧（プリセット・テンプレート・追加辞書・プレイブック・アバター）の表。
// 初めて使うときに大きい保存領域の表を開き、開けなければ画面の中だけの表にする。
// ─────────────────────────────

/** 控えから戻した結果。足した・置き換えた・一覧のものを残した（null） */
export type RestoreOutcome = 'added' | 'updated' | null;

/** 版（最後に変えた時刻）を持つ 1 件 */
interface Versioned {
  readonly updatedAt: number;
}

/** 照合して書く 1 件 */
interface LibraryWrite {
  readonly id: string;
  readonly value: unknown;
  /** このタブが持っていた版の時刻。新しく足す・控えから戻すときは null（照合しない） */
  readonly expected: number | null;
  /** 知らせに出す名前 */
  readonly name: string;
  /** 知らせを押したときに書く、一覧の今の 1 件 */
  readonly latest: () => unknown;
}

/** 一覧の表と、その読み書き */
export interface LibraryTable {
  /** 表（初めて呼んだときに開く） */
  readonly table: () => ChatTable;
  /** テストから置き場を差し替える */
  readonly install: (next: ChatTable | null) => void;
  /** 表のすべてを読む。形の合わない 1 件は飛ばし、表が読めなければ空 */
  readonly loadAll: <T>(
    parse: (raw: unknown) => T | null,
    idOf: (item: T) => string,
  ) => Promise<Record<string, T>>;
  /** 置き場の 1 件がほかのタブで変わっていないかを照合してから書く */
  readonly write: (write: LibraryWrite) => void;
  /** 書く順を守って消す */
  readonly remove: (id: string) => void;
}

/** 名前の表を作る。`onInstall` は置き場を差し替えたときに呼ぶ */
export function createLibraryTable(name: AppStoreName, onInstall?: () => void): LibraryTable {
  let table: ChatTable | null = null;

  const open = (): ChatTable => {
    if (table !== null) return table;
    table = openTable(name);
    return table;
  };

  return {
    table: open,
    install: (next) => {
      table = next;
      onInstall?.();
    },
    loadAll: async <T>(parse: (raw: unknown) => T | null, idOf: (item: T) => string) => {
      const found: Record<string, T> = {};
      try {
        const store = open();
        for (const key of await store.keys()) {
          const item = parse(await store.get(key));
          if (item !== null) setOwn(found, idOf(item), item);
        }
      } catch {
        // 読めなければ空の一覧で続ける
      }
      return found;
    },
    write: (write) => void writeChecked({ table: open(), scope: name, ...write }),
    remove: (id) => void deleteInOrder(open(), name, id),
  };
}

/**
 * 控えの 1 件を戻すか。一覧に同じ id があれば、最後に変えた時刻（版）の新しい方を残す
 */
export function restoreOutcomeOf(
  local: Versioned | undefined,
  incoming: Versioned,
): RestoreOutcome {
  if (local !== undefined && local.updatedAt >= incoming.updatedAt) return null;
  return local === undefined ? 'added' : 'updated';
}

function openTable(name: AppStoreName): ChatTable {
  try {
    if (typeof globalThis.indexedDB !== 'undefined')
      return indexedDbTable(globalThis.indexedDB, name);
  } catch {
    // IndexedDB へのアクセス自体が例外になる環境がある
  }
  return memoryTable();
}
