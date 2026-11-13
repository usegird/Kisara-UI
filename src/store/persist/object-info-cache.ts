import type { InputDefinition, NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import { isRecord, isUnknownArray } from '@/lib/guards';
import { hostKeyOf } from '@/lib/remote-host';
import { withAppStore } from '@/store/persist/app-db';

// ─────────────────────────────
// ノード定義（射影）の永続化。射影しても数 MB あり localStorage（上限 5 MB 前後）には
// 収まらないため、IndexedDB に置く（置き場の組み立ては `app-db`）。更新は手動リフレッシュだけ。
// ─────────────────────────────

/**
 * 射影の形を変えたら上げる。古いレコードは読み捨てる
 * （2: 由来のパック、3: 説明、4: よく使うものの区分、5: 区分をやめ利用頻度の表を足した）
 */
const RECORD_VERSION = 5;

/**
 * 控えの鍵。同じ ComfyUI を指す書き方の違い（`http`/`https`・末尾の `/`・パスなど）を 1 件に
 * まとめるため、ホスト名とポートだけで決める（`hostKeyOf`）
 */
export const definitionsKey = hostKeyOf;

/** 控えの 1 件。接続先ごとに 1 件 */
interface DefinitionCacheRecord {
  readonly version: number;
  /** 表の鍵（`definitionsKey` の値。名前は表の鍵の取り方に合わせたまま） */
  readonly baseUrl: string;
  readonly fetchedAt: number;
  readonly definitions: readonly NodeDefinition[];
  /** ノードの利用頻度の表（ノード名、多い順）。取れなければ空 */
  readonly frequency: readonly string[];
}

/** ノード定義の控えの読み書き（テストでは作り物に差し替える） */
export interface DefinitionCache {
  readonly load: (baseUrl: string) => Promise<DefinitionCacheRecord | null>;
  readonly save: (
    baseUrl: string,
    definitions: NodeDefinitionMap,
    now?: number,
    frequency?: readonly string[],
  ) => Promise<void>;
  readonly clear: (baseUrl: string) => Promise<void>;
}

/** ノード定義を控えの 1 件の形にする */
export function toCacheRecord(
  baseUrl: string,
  definitions: NodeDefinitionMap,
  now: number = Date.now(),
  frequency: readonly string[] = [],
): DefinitionCacheRecord {
  return {
    version: RECORD_VERSION,
    baseUrl: definitionsKey(baseUrl),
    fetchedAt: now,
    definitions: [...definitions.values()],
    frequency,
  };
}

function parseInput(raw: unknown): InputDefinition | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.name !== 'string' || typeof raw.type !== 'string') return null;

  return {
    name: raw.name,
    type: raw.type,
    required: raw.required === true,
    isWidget: raw.isWidget === true,
    options: isUnknownArray(raw.options) ? raw.options : null,
    config: isRecord(raw.config) ? raw.config : {},
  };
}

function parseDefinition(raw: unknown): NodeDefinition | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.name !== 'string') return null;

  const inputs: InputDefinition[] = [];
  for (const input of isUnknownArray(raw.inputs) ? raw.inputs : []) {
    const parsed = parseInput(input);
    if (parsed) inputs.push(parsed);
  }

  const outputs = (isUnknownArray(raw.outputs) ? raw.outputs : []).flatMap((output) => {
    if (!isRecord(output)) return [];
    if (typeof output.name !== 'string' || typeof output.type !== 'string') return [];
    return [{ name: output.name, type: output.type }];
  });

  return {
    name: raw.name,
    displayName: typeof raw.displayName === 'string' ? raw.displayName : raw.name,
    category: typeof raw.category === 'string' ? raw.category : '',
    module: typeof raw.module === 'string' ? raw.module : '',
    inputs,
    outputs,
    outputNode: raw.outputNode === true,
    description: typeof raw.description === 'string' ? raw.description : '',
  };
}

/** 保存済みレコードを検証して読み戻す。壊れていれば null（黙って空にしない） */
export function fromCacheRecord(raw: unknown): DefinitionCacheRecord | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== RECORD_VERSION) return null;
  if (typeof raw.baseUrl !== 'string') return null;
  if (!isUnknownArray(raw.definitions)) return null;

  const definitions: NodeDefinition[] = [];
  for (const entry of raw.definitions) {
    const parsed = parseDefinition(entry);
    if (parsed) definitions.push(parsed);
  }
  if (definitions.length === 0) return null;

  return {
    version: RECORD_VERSION,
    baseUrl: raw.baseUrl,
    fetchedAt: typeof raw.fetchedAt === 'number' ? raw.fetchedAt : 0,
    definitions,
    frequency: isUnknownArray(raw.frequency)
      ? raw.frequency.filter((name): name is string => typeof name === 'string')
      : [],
  };
}

/** 控えの 1 件を、ノード名で引ける表に戻す */
export function toDefinitionMap(record: DefinitionCacheRecord): NodeDefinitionMap {
  return new Map(record.definitions.map((definition) => [definition.name, definition]));
}

// ── IndexedDB 実装 ──────────────────────────

/** 大きい保存領域（IndexedDB）に置く控えを作る */
export function createIndexedDbCache(factory: IDBFactory): DefinitionCache {
  return {
    async load(baseUrl) {
      const raw: unknown = await withAppStore(factory, 'object-info', 'readonly', (store) =>
        store.get(definitionsKey(baseUrl)),
      );
      return fromCacheRecord(raw);
    },
    async save(baseUrl, definitions, now, frequency) {
      const record = toCacheRecord(baseUrl, definitions, now, frequency);
      await withAppStore(factory, 'object-info', 'readwrite', (store) => store.put(record));
    },
    async clear(baseUrl) {
      await withAppStore(factory, 'object-info', 'readwrite', (store) =>
        store.delete(definitionsKey(baseUrl)),
      );
    },
  };
}

/**
 * 接続先の履歴の × で外した接続先の控えを消す。`keep`（今の接続先と残る履歴）に
 * 同じ相手（ホスト名とポート）があれば消さない。消せなくても投げない（取り直せる控えなので警告しない）
 */
export async function forgetDefinitionsOf(
  url: string,
  keep: readonly string[],
  cache: () => DefinitionCache | null = indexedDbCacheOrNull,
): Promise<void> {
  const key = definitionsKey(url);
  if (keep.some((other) => definitionsKey(other) === key)) return;
  try {
    await cache()?.clear(url);
  } catch {
    // IndexedDB へのアクセス自体が例外になる環境がある
  }
}

function indexedDbCacheOrNull(): DefinitionCache | null {
  return typeof globalThis.indexedDB === 'undefined'
    ? null
    : createIndexedDbCache(globalThis.indexedDB);
}

/** IndexedDB が使えない環境（プライベートウィンドウ等）向けのフォールバック */
export function createMemoryCache(): DefinitionCache {
  const store = new Map<string, DefinitionCacheRecord>();

  return {
    load: (baseUrl) => Promise.resolve(store.get(definitionsKey(baseUrl)) ?? null),
    save: (baseUrl, definitions, now, frequency) => {
      store.set(definitionsKey(baseUrl), toCacheRecord(baseUrl, definitions, now, frequency));
      return Promise.resolve();
    },
    clear: (baseUrl) => {
      store.delete(definitionsKey(baseUrl));
      return Promise.resolve();
    },
  };
}
