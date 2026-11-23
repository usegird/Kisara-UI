import {
  checkDictionaryName,
  dictionaryKey,
  isDefaultDictionary,
  orderDictionaries,
  type DictionaryNameError,
  type TagDictionary,
  type TagEntry,
  type TagSources,
} from '@/graph/tag-dictionary';
import type { TagsPort } from '@/port/tags';

export type TagCommitFailure = DictionaryNameError | 'not-loaded';

export interface TagChanges {
  readonly dictionaries: readonly TagDictionary[];
  readonly removed: readonly string[];
  readonly overrides: readonly TagEntry[] | null;
}

export interface WriteStep {
  readonly run: () => Promise<void>;
  readonly apply: (sources: TagSources) => TagSources;
}

export function planCommit(
  state: TagSources,
  port: TagsPort,
  baseUrl: string,
  changes: TagChanges,
): readonly WriteStep[] | DictionaryNameError {
  const steps: WriteStep[] = [];
  for (const name of changes.removed) {
    if (findDictionary(state, name) === undefined) continue;
    steps.push({
      run: () => port.removeDictionary(baseUrl, name, {}),
      apply: (sources) => ({ ...sources, dictionaries: without(sources.dictionaries, name) }),
    });
  }
  for (const dictionary of changes.dictionaries) {
    const overwrite =
      isDefaultDictionary(dictionary.name) || findDictionary(state, dictionary.name) !== undefined;
    if (!overwrite) {
      const failure = checkDictionaryName(state.dictionaries, dictionary.name);
      if (failure !== null) return failure;
    }
    steps.push({
      run: () => port.saveDictionary(baseUrl, dictionary, overwrite, {}),
      apply: (sources) => ({
        ...sources,
        dictionaries: orderDictionaries([
          ...without(sources.dictionaries, dictionary.name),
          dictionary,
        ]),
      }),
    });
  }
  const { overrides } = changes;
  if (overrides !== null) {
    steps.push({
      run: () => port.saveOverrides(baseUrl, overrides, {}),
      apply: (sources) => ({ ...sources, overrides }),
    });
  }
  return steps;
}

function findDictionary(state: TagSources, name: string): TagDictionary | undefined {
  const key = dictionaryKey(name);
  return state.dictionaries.find((item) => dictionaryKey(item.name) === key);
}

function without(dictionaries: readonly TagDictionary[], name: string): TagDictionary[] {
  const key = dictionaryKey(name);
  return dictionaries.filter((item) => dictionaryKey(item.name) !== key);
}
