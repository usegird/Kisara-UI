import { connectedComfyUrl, useConnectionStore } from '@/store/use-connection-store';
import { useStorageDialogStore } from '@/store/use-storage-dialog-store';

export function startBackupCleanupCheck(): () => void {
  const checked = new Set<string>();
  const onConnection = (): void => {
    const baseUrl = connectedComfyUrl();
    const shown = useStorageDialogStore.getState().staleUrl;
    if (shown !== null && shown !== baseUrl) useStorageDialogStore.getState().clearStale();
    if (baseUrl === null || checked.has(baseUrl)) return;
    checked.add(baseUrl);
    void recheck(baseUrl);
  };
  const onDialog = (
    state: { readonly isOpen: boolean },
    previous: { readonly isOpen: boolean },
  ): void => {
    if (!previous.isOpen || state.isOpen) return;
    const baseUrl = useStorageDialogStore.getState().staleUrl;
    if (baseUrl !== null && baseUrl === connectedComfyUrl()) void recheck(baseUrl);
  };
  const unsubscribeConnection = useConnectionStore.subscribe(onConnection);
  const unsubscribeDialog = useStorageDialogStore.subscribe(onDialog);
  onConnection();
  return () => {
    unsubscribeConnection();
    unsubscribeDialog();
  };
}

async function recheck(baseUrl: string): Promise<void> {
  try {
    const { hasStaleBackups } = await import('@/store/persist/storage-backups');
    const stale = await hasStaleBackups(Date.now());
    if (connectedComfyUrl() !== baseUrl) return;
    const store = useStorageDialogStore.getState();
    if (stale) store.markStale(baseUrl);
    else if (store.staleUrl === baseUrl) store.clearStale();
  } catch {
  }
}
