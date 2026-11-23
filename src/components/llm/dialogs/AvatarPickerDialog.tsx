import { Smile, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AvatarExpressionDialog } from '@/components/llm/dialogs/AvatarExpressionDialog';
import { cardIcon } from '@/components/shared/card-icon';
import { ImagePicker, NONE_IMAGE } from '@/components/shared/ImagePicker';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
import { useAvatarExpressionsStore } from '@/store/use-avatar-expressions-store';
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
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{
    readonly id: string;
    readonly name: string;
    readonly clear: () => void;
  } | null>(null);
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
    <>
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
        bandActions={({ item, clear }) => (
          <button
            type="button"
            className={cn(DIALOG_ICON_CLASS, 'shrink-0')}
            aria-label={t('llm.avatarPicker.delete')}
            title={t('llm.avatarPicker.delete')}
            disabled={item === null || item.value === NONE_IMAGE}
            onClick={() => {
              if (item === null || item.value === NONE_IMAGE) return;
              setRemoving({ id: item.value, name: item.label, clear });
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
        cardActions={(item) => (
          <ExpressionCorner
            avatarId={item.value}
            name={item.label}
            onOpen={() => setEditing(item.value)}
          />
        )}
        onRename={(item, name) => useAvatarsStore.getState().rename(item.value, name)}
        noneLabel={t('llm.avatarPicker.none')}
        onPlace={(picked) => onPlace(picked === '' ? null : picked)}
      />
      <ConfirmDialog
        open={removing !== null}
        title={t('llm.avatarPicker.deleteTitle')}
        description={t('llm.avatarPicker.deleteMessage', { name: removing?.name ?? '' })}
        confirmLabel={t('common.deleteConfirm')}
        onConfirm={() => {
          if (removing === null) return;
          useAvatarsStore.getState().remove(removing.id);
          removing.clear();
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
      {editing === null ? null : (
        <AvatarExpressionDialog avatarId={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function ExpressionCorner({
  avatarId,
  name,
  onOpen,
}: {
  readonly avatarId: string;
  readonly name: string;
  readonly onOpen: () => void;
}): React.ReactElement {
  const has = useAvatarExpressionsStore((state) => state.marks[avatarId]?.has ?? false);
  const hash = useAvatarsStore((state) => state.avatars[avatarId]?.hash);
  useEffect(() => {
    if (hash !== undefined) useAvatarExpressionsStore.getState().ensureMark(avatarId);
  }, [avatarId, hash]);
  return (
    <button
      type="button"
      className={cardIcon({ shown: has ? 'always' : 'hover' })}
      aria-label={t('llm.expression.openFor', { name })}
      title={t('llm.expression.open')}
      onClick={onOpen}
    >
      <Smile className="size-4" aria-hidden />
    </button>
  );
}
