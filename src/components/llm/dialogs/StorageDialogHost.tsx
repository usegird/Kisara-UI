import { StorageDialog } from '@/components/llm/dialogs/StorageDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { t } from '@/i18n';
import { useStorageDialogStore } from '@/store/use-storage-dialog-store';

// ─────────────────────────────
// ストレージの管理と、古いバックアップの知らせの出し先。設定の欄と知らせのどちらから開いても同じ 1 つを出す。
// ─────────────────────────────

/** ストレージの管理のダイアログと古いバックアップの知らせを出す。外枠が、一度でも開いた・知らせたときから置く */
export function StorageDialogHost(): React.ReactElement {
  const open = useStorageDialogStore((state) => state.isOpen);
  const start = useStorageDialogStore((state) => state.start);
  const staleNotice = useStorageDialogStore((state) => state.staleNotice);
  return (
    <>
      <StorageDialog
        open={open}
        start={start}
        onOpenChange={(next) => {
          if (!next) useStorageDialogStore.getState().close();
        }}
      />
      <ConfirmDialog
        open={staleNotice}
        title={t('llm.storage.cleanup.notice.title')}
        description={t('llm.storage.cleanup.notice.description')}
        confirmLabel={t('llm.storage.cleanup.notice.confirm')}
        cancelLabel={t('llm.storage.cleanup.notice.later')}
        onConfirm={() => {
          useStorageDialogStore.getState().closeStaleNotice();
          useStorageDialogStore.getState().open('comfyBackup');
        }}
        onCancel={() => useStorageDialogStore.getState().closeStaleNotice()}
      />
    </>
  );
}
