import { BrushCleaning } from 'lucide-react';

import { chatRow } from '@/components/llm/chat-list/chat-row-style';
import { t } from '@/i18n';
import { useStorageDialogStore } from '@/store/use-storage-dialog-store';

export function StaleBackupRow({
  className,
  onChosen,
}: {
  readonly className?: string | undefined;
  readonly onChosen: () => void;
}): React.ReactElement | null {
  const stale = useStorageDialogStore((state) => state.staleUrl !== null);
  if (!stale) return null;
  const onClick = (): void => {
    onChosen();
    useStorageDialogStore.getState().open('comfyBackup');
  };
  return (
    <button
      type="button"
      className={chatRow({ active: false, tone: 'caution', className })}
      onClick={onClick}
    >
      <BrushCleaning className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{t('llm.sidebar.tidyBackups')}</span>
    </button>
  );
}
