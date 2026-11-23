import { RefreshCw } from 'lucide-react';

import { ImagePicker } from '@/components/shared/ImagePicker';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { buildImageItems } from '@/graph/image-options';
import type { ImageUpload } from '@/hooks/comfy/use-image-upload';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';

export interface ImagePickerDialogProps {
  readonly subtitle: string;
  readonly trigger: React.ReactNode;
  readonly value: string;
  readonly options: readonly unknown[];
  readonly upload: ImageUpload;
  readonly onPlace: (value: string) => void;
}

export function ImagePickerDialog({
  subtitle,
  trigger,
  value,
  options,
  upload,
  onPlace,
}: ImagePickerDialogProps): React.ReactElement {
  const items = buildImageItems(options);
  return (
    <ImagePicker
      id="image-picker"
      title={t('imagePicker.title')}
      subtitle={subtitle}
      trigger={trigger}
      value={value}
      items={items}
      srcOf={upload.srcOf}
      uploading={upload.uploading}
      uploadDisabled={upload.baseUrl.length === 0}
      upload={upload.upload}
      headerActions={
        <button
          type="button"
          className={DIALOG_ICON_CLASS}
          aria-label={t('imagePicker.refresh.label')}
          title={t('imagePicker.refresh.title')}
          disabled={upload.reloading || upload.baseUrl.length === 0}
          onClick={guardPress('image-options-reload', upload.reload)}
        >
          <RefreshCw className={refreshIcon({ loading: upload.reloading })} aria-hidden />
        </button>
      }
      onPlace={onPlace}
    />
  );
}
