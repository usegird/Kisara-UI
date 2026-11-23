import { create } from 'zustand';

import { onStorageWriteFailure } from '@/lib/safe-storage';

type UnsavedKind = 'settings' | 'draft' | 'library';

interface StorageWarningsState {
  readonly last: { readonly kind: UnsavedKind; readonly serial: number } | null;
}

export const useStorageWarningsStore = create<StorageWarningsState>()(() => ({ last: null }));

export function warnUnsaved(kind: UnsavedKind): void {
  const serial = (useStorageWarningsStore.getState().last?.serial ?? 0) + 1;
  useStorageWarningsStore.setState({ last: { kind, serial } });
}

onStorageWriteFailure((area) => {
  if (area === 'local') warnUnsaved('settings');
});
