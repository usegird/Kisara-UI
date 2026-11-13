// ─────────────────────────────
// 大きい保存領域（IndexedDB）の組み立て。1 つの置き場の中を用途ごとの表に分ける。
// ─────────────────────────────

const DB_NAME = 'kisaraui';

/** 大きい保存領域へ書き出すまで待つ時間（ミリ秒）。打鍵が止まってから書く */
export const WRITE_DELAY_MS = 800;
/**
 * 版。表の一覧と版はここだけで決める（用途ごとに別の版で開くと、後から開いた側が版の食い違いで失敗する）。
 * 版を上げるときは、足りない表を足すだけにする（既にある表の中身は消さない）。
 * 1: ノード定義、2: 開いていたタブ、3: 会話、4: 会話の一覧、5: プリセット、
 * 6: システムプロンプトのテンプレート、7: 追加辞書、8: アバターの画像、9: 自分のプレイブック
 */
const DB_VERSION = 9;

/** 表の名前 */
export type AppStoreName =
  | 'object-info'
  | 'session'
  | 'chat'
  | 'chat-meta'
  | 'preset'
  | 'system-prompt'
  | 'dictionary'
  | 'avatar'
  | 'playbook';

/** 表ごとの鍵の取り方。`null` は鍵を外から渡す表 */
const STORES: Readonly<Record<AppStoreName, string | null>> = {
  'object-info': 'baseUrl',
  session: null,
  chat: null,
  'chat-meta': null,
  preset: null,
  'system-prompt': null,
  dictionary: null,
  avatar: null,
  playbook: null,
};

/** IndexedDB の要求 1 つを、成功で結果・失敗で例外になる Promise に包む */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openAppDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        if (keyPath === null) db.createObjectStore(name);
        else db.createObjectStore(name, { keyPath });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
    // 別の画面が古い版で開いたままだと待たされる。止まらずに失敗として返す
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another page'));
  });
}

/** 表を 1 つ開いて 1 回の操作を行い、閉じる */
export async function withAppStore<T>(
  factory: IDBFactory,
  name: AppStoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openAppDb(factory);
  try {
    return await promisify(run(db.transaction(name, mode).objectStore(name)));
  } finally {
    db.close();
  }
}
