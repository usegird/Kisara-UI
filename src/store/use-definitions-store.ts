import { create, type StoreApi } from 'zustand';

import { needsOptions } from '@/graph/node-definition';
import { carrySearchIndex, searchIndexOf } from '@/graph/search-index';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import { compositeKey } from '@/lib/own-key';
import { yieldToMain } from '@/lib/yield-to-main';
import type { DefinitionsPort } from '@/port/comfy-port';
import type { RequestFailure } from '@/port/connection';
import { fallbackRequestFailure } from '@/queue/comfy-failure-text';
import {
  createIndexedDbCache,
  createMemoryCache,
  definitionsKey,
  toDefinitionMap,
  type DefinitionCache,
} from '@/store/persist/object-info-cache';
import { comfyPort } from '@/store/ports/comfy-port';

// ─────────────────────────────
// ノード定義（`/object_info` の射影）の保持。接続したときに 1 回だけ取り、取り直しは手動だけ。
// 起動時は残した定義だけを戻し（通信しない）、COMBO の選択肢は要るときに 1 クラスずつ取る。
// ─────────────────────────────

/** ノード定義の読み込みの段階 */
type DefinitionsStatus = 'idle' | 'loading' | 'ready' | 'error';
/** 持っている定義の出どころ（取得か控えか）。持っていなければ null */
type DefinitionsSource = 'network' | 'cache' | null;

/** ノード定義と、その読み込み・取り直しの操作 */
interface DefinitionsState {
  readonly status: DefinitionsStatus;
  readonly source: DefinitionsSource;
  readonly definitions: NodeDefinitionMap;
  readonly fetchedAt: number | null;
  /** ノードの利用頻度の表（ノード名、多い順）。取れなければ空（よく使うものを出さない） */
  readonly frequency: readonly string[];
  readonly error: RequestFailure | null;
  /**
   * 同じ接続先の定義を持っていれば何もしない。
   * 持っていなければキャッシュを使い、それも無ければ取得する
   */
  readonly load: (baseUrl: string) => Promise<void>;
  /** 起動時の復帰用。**キャッシュだけ**を見る（ネットワークには出ない） */
  readonly loadCached: (baseUrl: string) => Promise<boolean>;
  /** 手動リフレッシュ。必ずネットワークから取り直す */
  readonly refresh: (baseUrl: string) => Promise<void>;
  /** COMBO の選択肢を1クラスだけ遅延取得する */
  readonly ensureOptions: (baseUrl: string, className: string) => Promise<void>;
  /**
   * 1クラスの選択肢を、持っていても取り直す。画像をアップロードしたときだけ使う
   * （自動の差分更新を据え置いた決まりの、合意済みの例外）
   */
  readonly reloadOptions: (baseUrl: string, className: string) => Promise<void>;
  readonly clear: () => void;
}

/** ノード定義のストアが使う取得と控え（テストでは作り物に差し替える） */
export interface DefinitionsDeps {
  readonly fetchAll: DefinitionsPort['fetchAll'];
  readonly fetchOne: DefinitionsPort['fetchOne'];
  /** 利用頻度の表。渡さなければ取らない */
  readonly fetchFrequency?: DefinitionsPort['fetchFrequency'] | undefined;
  readonly cache: DefinitionCache;
}

function toFailure(error: unknown, url: string): RequestFailure {
  return comfyPort().connection.failureOf(error) ?? fallbackRequestFailure(error, url);
}

function defaultDefinitionCache(): DefinitionCache {
  try {
    if (typeof globalThis.indexedDB !== 'undefined') {
      return createIndexedDbCache(globalThis.indexedDB);
    }
  } catch {
    // IndexedDB へのアクセス自体が例外になる環境がある
  }
  return createMemoryCache();
}

/** 渡した取得と控えでノード定義のストアを作る */
export function createDefinitionsStore(deps: DefinitionsDeps) {
  const loading: DefinitionsLoading = {
    inFlightOptions: new Set(),
    loadedFor: null,
    generation: 0,
  };

  const store = create<DefinitionsState>()((set, get) => {
    const access: DefinitionsAccess = { deps, loading, set, get };
    return {
      ...emptyDefinitions(),

      async load(baseUrl) {
        // 起動時に戻した分・切断前の分を読み直さない（選択肢の取得結果も捨てずに済む）
        if (get().status === 'ready' && loading.loadedFor === definitionsKey(baseUrl)) return;
        const mine = ++loading.generation;
        set({ status: 'loading', error: null });

        const cached = await deps.cache.load(baseUrl).catch(() => null);
        if (mine !== loading.generation) return;
        if (cached) {
          loading.loadedFor = definitionsKey(baseUrl);
          set(cachedDefinitions(cached));
          return;
        }
        await fromNetwork(access, baseUrl, 'network');
      },

      async loadCached(baseUrl) {
        if (get().status !== 'idle') return false;
        const mine = loading.generation;

        const cached = await deps.cache.load(baseUrl).catch(() => null);
        if (!cached || get().status !== 'idle' || mine !== loading.generation) return false;

        loading.loadedFor = definitionsKey(baseUrl);
        set(cachedDefinitions(cached));
        return true;
      },

      refresh: (baseUrl) => fromNetwork(access, baseUrl, 'network'),

      async ensureOptions(baseUrl, className) {
        const current = get().definitions.get(className);
        if (!current || !needsOptions(current)) return;

        const key = compositeKey(baseUrl, className);
        if (loading.inFlightOptions.has(key)) return;
        loading.inFlightOptions.add(key);

        try {
          await fetchOptions(access, baseUrl, className);
        } finally {
          loading.inFlightOptions.delete(key);
        }
      },

      async reloadOptions(baseUrl, className) {
        // 走っている遅延取得とは重ねてよい（アップロードの前に出た要求は古い一覧を返しうる）
        if (!get().definitions.has(className)) return;
        await fetchOptions(access, baseUrl, className);
      },

      clear: () => {
        loading.generation += 1;
        loading.loadedFor = null;
        set(emptyDefinitions());
      },
    };
  });

  // 検索の索引は、ノード定義が入ったとき（取得・キャッシュからの復帰）に作っておく。
  // 検索を開くたびに作らない
  store.subscribe((state, previous) => {
    if (state.definitions !== previous.definitions && state.definitions.size > 0) {
      searchIndexOf(state.definitions);
    }
  });
  return store;
}

/** 読み込みの手掛かり（状態に置かない。描画には要らない） */
interface DefinitionsLoading {
  /** 同じクラスの遅延取得が重複しないようにする */
  readonly inFlightOptions: Set<string>;
  /** 今持っている定義の接続先（`definitionsKey` の値） */
  loadedFor: string | null;
  /**
   * 読み込みの世代。読み込みを始める・捨てるたびに進め、待っている間に進んでいたら結果を捨てる
   * （接続先を切り替えた後に、前の接続先の応答で定義を上書きしない）
   */
  generation: number;
}

/** 取得の手続きが使う、取得と控え・読み込みの手掛かり・ストアの読み書き */
interface DefinitionsAccess {
  readonly deps: DefinitionsDeps;
  readonly loading: DefinitionsLoading;
  readonly set: StoreApi<DefinitionsState>['setState'];
  readonly get: () => DefinitionsState;
}

/** 定義を持っていない状態（定義の表は毎回新しく作る） */
function emptyDefinitions(): Omit<
  DefinitionsState,
  'load' | 'loadCached' | 'refresh' | 'ensureOptions' | 'reloadOptions' | 'clear'
> {
  return {
    status: 'idle',
    source: null,
    definitions: new Map<string, NodeDefinition>(),
    fetchedAt: null,
    frequency: [],
    error: null,
  };
}

/** 控えから戻した定義を載せる形 */
function cachedDefinitions(
  cached: NonNullable<Awaited<ReturnType<DefinitionCache['load']>>>,
): Partial<DefinitionsState> {
  return {
    status: 'ready',
    source: 'cache',
    definitions: toDefinitionMap(cached),
    fetchedAt: cached.fetchedAt,
    frequency: cached.frequency,
    error: null,
  };
}

/** 接続先から取り直して載せ、控えに書く */
async function fromNetwork(
  access: DefinitionsAccess,
  baseUrl: string,
  source: DefinitionsSource,
): Promise<void> {
  const { deps, loading, set } = access;
  const mine = ++loading.generation;
  set({ status: 'loading', error: null });
  let definitions: NodeDefinitionMap;
  let frequency: string[];
  try {
    // 頻度の表は無くてもよい（frontend の版によっては無い）。定義の取得は止めない
    [definitions, frequency] = await Promise.all([
      deps.fetchAll(baseUrl, {}),
      deps.fetchFrequency?.(baseUrl, {}).catch((): string[] => []) ?? [],
    ]);
  } catch (error) {
    if (mine === loading.generation) set({ status: 'error', error: toFailure(error, baseUrl) });
    return;
  }
  if (mine !== loading.generation) return;
  const fetchedAt = Date.now();
  loading.loadedFor = definitionsKey(baseUrl);
  set({ status: 'ready', source, definitions, fetchedAt, frequency, error: null });
  // 控えを書くのは次の task で（入れた直後の描画・索引づくりと同じフレームに積まない）
  await yieldToMain();
  // 控えに書けなくても取れた定義は使う（次の起動で取り直すだけ）
  await deps.cache.save(baseUrl, definitions, fetchedAt, frequency).catch(() => undefined);
}

/** 1クラスを取り、選択肢だけを差し替える */
async function fetchOptions(
  access: DefinitionsAccess,
  baseUrl: string,
  className: string,
): Promise<void> {
  const { deps, loading, set, get } = access;
  try {
    const detailed = await deps.fetchOne(baseUrl, className, {});
    if (!detailed) return;
    // 待っている間に別の接続先の定義へ替わっていたら差し込まない
    if (loading.loadedFor !== definitionsKey(baseUrl) || get().status !== 'ready') return;

    const next = new Map(get().definitions);
    next.set(className, detailed);
    // 選択肢だけが変わる。検索の索引（名前・分類・型）はそのまま引き継ぐ
    carrySearchIndex(get().definitions, next);
    set({ definitions: next });
  } catch (error) {
    if (loading.loadedFor === definitionsKey(baseUrl)) set({ error: toFailure(error, baseUrl) });
  }
}

// 通信は呼ぶたびに窓口から引く（入口で入れた実装を使う）
export const useDefinitionsStore = createDefinitionsStore({
  fetchAll: (baseUrl, options) => comfyPort().definitions.fetchAll(baseUrl, options),
  fetchOne: (baseUrl, className, options) =>
    comfyPort().definitions.fetchOne(baseUrl, className, options),
  fetchFrequency: (baseUrl, options) => comfyPort().definitions.fetchFrequency(baseUrl, options),
  cache: defaultDefinitionCache(),
});
