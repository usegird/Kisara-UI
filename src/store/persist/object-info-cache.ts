import type { InputDefinition, NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import { isRecord, isUnknownArray } from '@/lib/guards';
import { hostKeyOf } from '@/lib/remote-host';
import { withAppStore } from '@/store/persist/app-db';

const RECORD_VERSION = 5;

export const definitionsKey = hostKeyOf;

interface DefinitionCacheRecord {
  readonly version: number;
  readonly baseUrl: string;
  readonly fetchedAt: number;
  readonly definitions: readonly NodeDefinition[];
  readonly frequency: readonly string[];
}

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

export function toDefinitionMap(record: DefinitionCacheRecord): NodeDefinitionMap {
  return new Map(record.definitions.map((definition) => [definition.name, definition]));
}

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
  }
}

function indexedDbCacheOrNull(): DefinitionCache | null {
  return typeof globalThis.indexedDB === 'undefined'
    ? null
    : createIndexedDbCache(globalThis.indexedDB);
}

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
