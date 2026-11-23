import { Loader2, Upload } from 'lucide-react';

import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

interface UploadButtonProps {
  readonly uploading: boolean;
  readonly disabled: boolean;
  readonly fileInput: React.RefObject<HTMLInputElement | null>;
  readonly onFiles: (files: readonly File[]) => void;
}

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
          event.target.value = '';
        }}
      />
    </>
  );
}
