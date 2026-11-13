import { RefreshCw } from 'lucide-react';

import { ImagePicker } from '@/components/shared/ImagePicker';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { buildImageItems } from '@/graph/image-options';
import type { ImageUpload } from '@/hooks/comfy/use-image-upload';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';

// ─────────────────────────────
// パラメータ行から開く画像を選ぶダイアログ。中身は共通の `ImagePicker` で、ここは選択肢を
// 接続先の入力フォルダから作り、見出しに取り直しを足す。
// ─────────────────────────────

/** 画像を選ぶダイアログの props */
export interface ImagePickerDialogProps {
  /** 見出しの補足（パラメータ名） */
  readonly subtitle: string;
  /** 開く引き金（`ModelPickerField`） */
  readonly trigger: React.ReactNode;
  /** 現在の値（選択肢の文字列） */
  readonly value: string;
  readonly options: readonly unknown[];
  /** アップロードと選択肢の取り直し（`useImageUpload`） */
  readonly upload: ImageUpload;
  /** 決定した値を返す。使い道は呼び出し元が決める */
  readonly onPlace: (value: string) => void;
}

/** 接続先の画像の選択肢を共通の `ImagePicker` に渡し、見出しに取り直しのボタンを置く */
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
