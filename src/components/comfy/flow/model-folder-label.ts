import { t, type MessageKey } from '@/i18n';

// ─────────────────────────────
// モデルの種別の呼び名。ダイアログの見出しと、パラメータ行の引き金の読み上げで使う。
// ─────────────────────────────

const FOLDER_LABELS: Readonly<Record<string, MessageKey>> = {
  loras: 'modelPicker.folder.loras',
  checkpoints: 'modelPicker.folder.checkpoints',
};

/** モデルの種別（フォルダ名）の呼び名を返す。表に無い種別は名前をそのまま返す */
export function folderLabel(folder: string): string {
  const key = FOLDER_LABELS[folder];
  return key === undefined ? folder : t(key);
}
