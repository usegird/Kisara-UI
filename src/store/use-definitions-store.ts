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

type DefinitionsStatus = 'idle' | 'loading' | 'ready' | 'error';
type DefinitionsSource = 'network' | 'cache' | null;

interface DefinitionsState {
  readonly status: DefinitionsStatus;
  readonly source: DefinitionsSource;
  readonly definitions: NodeDefinitionMap;
  readonly fetchedAt: number | null;
  readonly frequency: readonly string[];
  readonly error: RequestFailure | null;
  readonly load: (baseUrl: string) => Promise<void>;
  readonly loadCached: (baseUrl: string) => Promise<boolean>;
  readonly refresh: (baseUrl: string) => Promise<void>;
  readonly ensureOptions: (baseUrl: string, className: string) => Promise<void>;
  readonly reloadOptions: (baseUrl: string, className: string) => Promise<void>;
  readonly clear: () => void;
}

export interface DefinitionsDeps {
  readonly fetchAll: DefinitionsPort['fetchAll'];
  readonly fetchOne: DefinitionsPort['fetchOne'];
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
  }
  return createMemoryCache();
}

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

  store.subscribe((state, previous) => {
    if (state.definitions !== previous.definitions && state.definitions.size > 0) {
      searchIndexOf(state.definitions);
    }
  });
  return store;
}

interface DefinitionsLoading {
  readonly inFlightOptions: Set<string>;
  loadedFor: string | null;
  generation: number;
}

interface DefinitionsAccess {
  readonly deps: DefinitionsDeps;
  readonly loading: DefinitionsLoading;
  readonly set: StoreApi<DefinitionsState>['setState'];
  readonly get: () => DefinitionsState;
}

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
  await yieldToMain();
  await deps.cache.save(baseUrl, definitions, fetchedAt, frequency).catch(() => undefined);
}

async function fetchOptions(
  access: DefinitionsAccess,
  baseUrl: string,
  className: string,
): Promise<void> {
  const { deps, loading, set, get } = access;
  try {
    const detailed = await deps.fetchOne(baseUrl, className, {});
    if (!detailed) return;
    if (loading.loadedFor !== definitionsKey(baseUrl) || get().status !== 'ready') return;

    const next = new Map(get().definitions);
    next.set(className, detailed);
    carrySearchIndex(get().definitions, next);
    set({ definitions: next });
  } catch (error) {
    if (loading.loadedFor === definitionsKey(baseUrl)) set({ error: toFailure(error, baseUrl) });
  }
}

export const useDefinitionsStore = createDefinitionsStore({
  fetchAll: (baseUrl, options) => comfyPort().definitions.fetchAll(baseUrl, options),
  fetchOne: (baseUrl, className, options) =>
    comfyPort().definitions.fetchOne(baseUrl, className, options),
  fetchFrequency: (baseUrl, options) => comfyPort().definitions.fetchFrequency(baseUrl, options),
  cache: defaultDefinitionCache(),
});
