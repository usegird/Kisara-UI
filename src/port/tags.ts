import type { TagDictionary, TagEntry } from '@/graph/tag-dictionary';
import type { RequestOptions } from '@/port/connection';

export interface TagsPort {
  readonly fetchPysssss: (baseUrl: string, options?: RequestOptions) => Promise<TagEntry[] | null>;
  readonly fetchDictionaries: (
    baseUrl: string,
    options?: RequestOptions,
  ) => Promise<TagDictionary[]>;
  readonly fetchOverrides: (baseUrl: string, options?: RequestOptions) => Promise<TagEntry[]>;
  readonly saveDictionary: (
    baseUrl: string,
    dictionary: TagDictionary,
    overwrite: boolean,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly saveOverrides: (
    baseUrl: string,
    overrides: readonly TagEntry[],
    options?: RequestOptions,
  ) => Promise<void>;
}
