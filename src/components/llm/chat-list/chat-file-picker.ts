import { CHAT_FILE_MAX_BYTES } from '@/chat/import';
import { toastError, toastSuccess } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { wholeMegabytes } from '@/lib/file-size';
import type { ImportResult } from '@/store/chat/chat-transfer';

const ACCEPT = '.json,.jsonl,.png,application/json,image/png';

function report(name: string, result: ImportResult): void {
  if (result.unreadable || (result.added.length === 0 && !result.full)) {
    toastError(
      result.tooLarge === true
        ? t('common.fileTooLarge', { name, size: wholeMegabytes(CHAT_FILE_MAX_BYTES) })
        : t('llm.import.failed', { name }),
    );
    return;
  }
  const notes = [
    result.skipped > 0 ? t('llm.import.skipped', { count: result.skipped }) : null,
    result.dropped > 0 ? t('llm.import.dropped', { count: result.dropped }) : null,
    result.full ? t('llm.import.full') : null,
  ].filter((note) => note !== null);
  const toast = result.full ? toastError : toastSuccess;
  toast(
    t('llm.import.done', { count: result.added.length }),
    notes.length > 0 ? notes.join(' ') : undefined,
  );
}

export async function openChatFile(file: File): Promise<boolean> {
  const { importChatFile } = await import('@/store/chat/chat-transfer');
  const result = await importChatFile(file).catch((): ImportResult => ({
    added: [],
    skipped: 0,
    dropped: 0,
    full: false,
    unreadable: true,
  }));
  if (result.unreadable && result.tooLarge !== true) return false;
  report(file.name, result);
  return true;
}

export function pickChatFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file === undefined) return;
    void import('@/store/chat/preset-import')
      .then(({ openCardFile }) => openCardFile(file))
      .catch(() => false)
      .then(async (opened) => {
        if (opened) return null;
        const { importChatFile } = await import('@/store/chat/chat-transfer');
        return importChatFile(file);
      })
      .then(
        (result) => {
          if (result !== null) report(file.name, result);
        },
        () =>
          report(file.name, { added: [], skipped: 0, dropped: 0, full: false, unreadable: true }),
      );
  });
  input.click();
}
