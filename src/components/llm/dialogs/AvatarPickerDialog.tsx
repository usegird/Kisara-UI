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

// ─────────────────────────────
// アバターの画像の管理。入力画像を選ぶ画面と同じ `ImagePicker` に端末のアバターの表の画像を並べる。
// 決定した画像の使い道は呼び出し元が決める。
// ─────────────────────────────

/** アバターの画像の管理のダイアログの props */
export interface AvatarPickerDialogProps {
  /** 開く引き金（アバターの「画像を選ぶ」） */
  readonly trigger: React.ReactNode;
  /** 今の画像（アバターの id。無ければ空） */
  readonly value: string;
  /** 決定したアバターの id を返す。先頭の「なし」なら null（画像を外す） */
  readonly onPlace: (avatarId: string | null) => void;
}

/** アバターの画像を選ぶ・足す・消すダイアログ。足すのはアバターの表へ（中身が同じなら今ある 1 件を選ぶ） */
export function AvatarPickerDialog({
  trigger,
  value,
  onPlace,
}: AvatarPickerDialogProps): React.ReactElement {
  const avatars = useAvatarsStore((state) => state.avatars);
  const [uploading, setUploading] = useState(false);
  // compiler はこの部品を飛ばす（catch の無い try を扱えない）ので手で揃える
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

  /** 画像だけをアバターの表に足し、最後に足した（または同じ中身の）画像を選ぶ */
  const upload = async (files: readonly File[]): Promise<UploadOutcome> => {
    setUploading(true);
    try {
      // 大きすぎる画像は足さない（縮める前に絵にするので、巨大な画像で画面を止めない）
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
            // 確かめない。プリセットと会話はリンクを持ったままで、同じ画像を戻せばまた出る
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
