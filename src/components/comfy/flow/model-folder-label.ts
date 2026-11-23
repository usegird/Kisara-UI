import { t, type MessageKey } from '@/i18n';

const FOLDER_LABELS: Readonly<Record<string, MessageKey>> = {
  loras: 'modelPicker.folder.loras',
  checkpoints: 'modelPicker.folder.checkpoints',
};

export function folderLabel(folder: string): string {
  const key = FOLDER_LABELS[folder];
  return key === undefined ? folder : t(key);
}
