import { CARD_FILE_MAX_BYTES } from '@/chat/card-read';
import { IMAGE_FILE_MAX_BYTES, MEGABYTE } from '@/lib/file-size';
import { useSettingsStore } from '@/store/use-settings-store';

type RestoreSizeKind = 'chat' | 'avatar' | 'other';

function restoreLimit(kind: RestoreSizeKind): number {
  if (kind === 'chat') return useSettingsStore.getState().chatMaxMegabytes * MEGABYTE;
  return kind === 'avatar' ? IMAGE_FILE_MAX_BYTES : CARD_FILE_MAX_BYTES;
}

export function overRestoreLimit(kind: RestoreSizeKind, bytes: number): boolean {
  return bytes > restoreLimit(kind);
}
