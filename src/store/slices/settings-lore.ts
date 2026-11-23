import type { StateCreator } from 'zustand';

import { normalizingSetterOf, setterOf } from '@/store/settings-fields/settings-table';
import type { SettingsState } from '@/store/use-settings-store';

const OWN_PLAYBOOK_PREFIX = 'own:';

type SettingsLoreActions = Pick<
  SettingsState,
  | 'setLoreDictionariesOn'
  | 'setPlaybooksOn'
  | 'setPlaybookCardFolded'
  | 'setPlaybookShown'
  | 'setLoreDictionaryEnabled'
  | 'keepLoreDictionaryIds'
  | 'keepOwnPlaybookIds'
  | 'setLoreSemantic'
  | 'setWebSearchEngine'
  | 'setWebSearchMaxCalls'
  | 'setWebFetchMaxTokens'
>;

export const createSettingsLoreSlice: StateCreator<
  SettingsState,
  [['zustand/persist', unknown]],
  [],
  SettingsLoreActions
> = (set) => ({
  setLoreDictionariesOn: setterOf(set, 'loreDictionariesOn'),
  setPlaybooksOn: setterOf(set, 'playbooksOn'),
  setPlaybookCardFolded: setterOf(set, 'playbookCardFolded'),
  setPlaybookShown: (key, shown) =>
    set((state) => {
      if (state.playbooksHidden.includes(key) !== shown) return state;
      return {
        playbooksHidden: shown
          ? state.playbooksHidden.filter((item) => item !== key)
          : [...state.playbooksHidden, key],
      };
    }),
  setLoreDictionaryEnabled: (id, on) =>
    set((state) => {
      const has = state.loreDictionaryIds.includes(id);
      if (has === on) return state;
      return {
        loreDictionaryIds: on
          ? [...state.loreDictionaryIds, id]
          : state.loreDictionaryIds.filter((item) => item !== id),
      };
    }),
  keepLoreDictionaryIds: (ids) =>
    set((state) =>
      state.loreDictionaryIds.every((id) => ids.has(id))
        ? state
        : { loreDictionaryIds: state.loreDictionaryIds.filter((id) => ids.has(id)) },
    ),
  keepOwnPlaybookIds: (ids) =>
    set((state) => {
      const alive = (key: string): boolean =>
        !key.startsWith(OWN_PLAYBOOK_PREFIX) || ids.has(key.slice(OWN_PLAYBOOK_PREFIX.length));
      return state.playbooksHidden.every(alive)
        ? state
        : { playbooksHidden: state.playbooksHidden.filter(alive) };
    }),
  setLoreSemantic: setterOf(set, 'loreSemantic'),
  setWebSearchEngine: setterOf(set, 'webSearchEngine'),
  setWebSearchMaxCalls: normalizingSetterOf(set, 'webSearchMaxCalls'),
  setWebFetchMaxTokens: normalizingSetterOf(set, 'webFetchMaxTokens'),
});
