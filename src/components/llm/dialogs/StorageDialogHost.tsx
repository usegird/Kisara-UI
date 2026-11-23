import { StorageDialog } from '@/components/llm/dialogs/StorageDialog';
import { useStorageDialogStore } from '@/store/use-storage-dialog-store';

export function StorageDialogHost(): React.ReactElement {
  const open = useStorageDialogStore((state) => state.isOpen);
  const start = useStorageDialogStore((state) => state.start);
  return (
    <StorageDialog
      open={open}
      start={start}
      onOpenChange={(next) => {
        if (!next) useStorageDialogStore.getState().close();
      }}
    />
  );
}
