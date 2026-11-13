import { Loader2, Upload } from 'lucide-react';

import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// 画像を選ぶ枠の取り込みのボタン
// ─────────────────────────────

interface UploadButtonProps {
  readonly uploading: boolean;
  /** つながっていない */
  readonly disabled: boolean;
  readonly fileInput: React.RefObject<HTMLInputElement | null>;
  readonly onFiles: (files: readonly File[]) => void;
}

/** ファイルを選ぶ画面を開くボタン。送っている間は回す */
export function UploadButton({
  uploading,
  disabled,
  fileInput,
  onFiles,
}: UploadButtonProps): React.ReactElement {
  return (
    <>
      <button
        type="button"
        // 見出しの帯のアイコンと大きさを揃える
        className={cn(DIALOG_ICON_CLASS, 'shrink-0')}
        aria-label={t('imagePicker.upload.label')}
        title={t('imagePicker.upload.title')}
        aria-busy={uploading}
        disabled={uploading || disabled}
        onClick={() => fileInput.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        ) : (
          <Upload className="size-4" aria-hidden />
        )}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])]);
          // 同じファイルを続けて選んでも知らせが来るよう空にする
          event.target.value = '';
        }}
      />
    </>
  );
}
