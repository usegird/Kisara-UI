import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ImagePicker, NONE_IMAGE } from '@/components/shared/ImagePicker';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import type { ImageItem } from '@/graph/image-options';
import type { UploadOutcome } from '@/hooks/comfy/use-image-upload';
import { t } from '@/i18n';
import { blobUrl } from '@/lib/blob-url';
import {
  IMAGE_FILE_MAX_BYTES as AVATAR_MAX_BYTES,
  isTooLarge,
  wholeMegabytes,
} from '@/lib/file-size';
import { isImageFile } from '@/lib/image-attach';
import { cn } from '@/lib/utils';
import { avatarNameOf, useAvatarsStore } from '@/store/use-avatars-store';

export interface AvatarPickerDialogProps {
  readonly trigger: React.ReactNode;
  readonly value: string;
  readonly onPlace: (avatarId: string | null) => void;
}

export function AvatarPickerDialog({
  trigger,
  value,
  onPlace,
}: AvatarPickerDialogProps): React.ReactElement {
  const avatars = useAvatarsStore((state) => state.avatars);
  const [uploading, setUploading] = useState(false);
  const items = useMemo(
    (): ImageItem[] =>
      Object.values(avatars).map((avatar) => ({
        value: avatar.id,
        path: avatar.name,
        label: avatar.name,
      })),
    [avatars],
  );

  const srcOf = (id: string): string | null => {
    const image = avatars[id]?.image;
    return image === undefined ? null : blobUrl(image);
  };

  const upload = async (files: readonly File[]): Promise<UploadOutcome> => {
    setUploading(true);
    try {
      const images = files.filter(isImageFile);
      const tooLarge = images.find((file) => isTooLarge(file, AVATAR_MAX_BYTES));
      const sizeNotice =
        tooLarge === undefined
          ? null
          : t('common.fileTooLarge', {
              name: tooLarge.name,
              size: String(wholeMegabytes(AVATAR_MAX_BYTES)),
            });
      let last: string | null = null;
      for (const file of images.filter((image) => !isTooLarge(image, AVATAR_MAX_BYTES))) {
        last = (await useAvatarsStore.getState().add(file, avatarNameOf(file.name))).id;
      }
      if (last === null) {
        return { ok: false, notice: sizeNotice ?? t('llm.avatarPicker.notImage') };
      }
      const skipped = images.length < files.length ? t('llm.avatarPicker.notImage') : sizeNotice;
      return { ok: true, value: last, notice: skipped };
    } finally {
      setUploading(false);
    }
  };

  return (
    <ImagePicker
      id="avatar-picker"
      title={t('llm.avatarPicker.title')}
      trigger={trigger}
      value={value}
      items={items}
      srcOf={srcOf}
      uploading={uploading}
      uploadDisabled={false}
      upload={upload}
      bandActions={({ item }) => (
        <button
          type="button"
          className={cn(DIALOG_ICON_CLASS, 'shrink-0')}
          aria-label={t('llm.avatarPicker.delete')}
          title={t('llm.avatarPicker.delete')}
          disabled={item === null || item.value === NONE_IMAGE}
          onClick={() => {
            if (item === null || item.value === NONE_IMAGE) return;
            useAvatarsStore.getState().remove(item.value);
          }}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      )}
      noneLabel={t('llm.avatarPicker.none')}
      onPlace={(picked) => onPlace(picked === '' ? null : picked)}
    />
  );
}
