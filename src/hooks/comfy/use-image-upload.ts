import { useState } from 'react';

import { t } from '@/i18n';
import { IMAGE_FILE_MAX_BYTES, isTooLarge, wholeMegabytes } from '@/lib/file-size';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 画像のアップロードと、そのクラスの選択肢の取り直し。アップロードは押した・落とした操作からだけ呼ぶ。
// 終えたら、ノード定義の自動更新を持たない決めの合意済みの例外として、そのクラスの選択肢だけを取り直す。
// ─────────────────────────────

/** アップロードの結果。値は書かず、選ぶかどうかは呼び出し元が決める */
export type UploadOutcome =
  | {
      readonly ok: true;
      /** 最後に置いた画像の値 */
      readonly value: string;
      /** 知らせ（名前が変わった・画像でないものを飛ばした）。無ければ null */
      readonly notice: string | null;
    }
  | { readonly ok: false; readonly notice: string };

/** アップロードの状態と、送る・取り直す手続き */
export interface ImageUpload {
  readonly uploading: boolean;
  /** そのクラスの選択肢を取り直している */
  readonly reloading: boolean;
  readonly baseUrl: string;
  /** カードに出す画像の URL（`/view`）。作れなければ null */
  readonly srcOf: (value: string) => string | null;
  readonly upload: (files: readonly File[]) => Promise<UploadOutcome>;
  readonly reload: () => void;
}

function reasonOf(error: unknown): string {
  return formatComfyFailure(error);
}

/** 置いた名前が元と違う（同名があった）ものを並べる */
function renamedNotice(renamed: readonly string[]): string | null {
  return renamed.length === 0
    ? null
    : t('imagePicker.upload.renamed', { names: renamed.join(', ') });
}

/**
 * 画像を接続先の入力フォルダへ送り、終えたらそのクラスの選択肢を取り直す。
 * @param className - 選択肢を取り直すクラス。分からなければ null（取り直さない）
 */
export function useImageUpload(className: string | null): ImageUpload {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const reloadOptions = useDefinitionsStore((state) => state.reloadOptions);
  const [uploading, setUploading] = useState(false);
  const [reloading, setReloading] = useState(false);

  const reloadClass = async (): Promise<void> => {
    if (className === null || baseUrl.length === 0) return;
    setReloading(true);
    try {
      await reloadOptions(baseUrl, className);
    } finally {
      setReloading(false);
    }
  };

  const upload = async (files: readonly File[]): Promise<UploadOutcome> => {
    const allImages = files.filter((file) => file.type.startsWith('image/'));
    // 大きすぎる画像は送らない
    const tooLarge = allImages.find((file) => isTooLarge(file, IMAGE_FILE_MAX_BYTES));
    const sizeNotice =
      tooLarge === undefined
        ? null
        : t('common.fileTooLarge', {
            name: tooLarge.name,
            size: String(wholeMegabytes(IMAGE_FILE_MAX_BYTES)),
          });
    const images = allImages.filter((file) => !isTooLarge(file, IMAGE_FILE_MAX_BYTES));
    if (images.length === 0) {
      return { ok: false, notice: sizeNotice ?? t('imagePicker.upload.notImage') };
    }
    if (baseUrl.length === 0) return { ok: false, notice: t('imagePicker.upload.noConnection') };

    setUploading(true);
    const renamed: string[] = [];
    let last: string | null = null;
    let failure: string | null = null;
    try {
      // 1 つずつ送る（同名の番号付けが送った順になるように）
      for (const file of images) {
        const value = await comfyPort().inputImages.upload(baseUrl, file);
        if (!value.endsWith(file.name)) renamed.push(value);
        last = value;
      }
    } catch (error) {
      failure = t('imagePicker.upload.failed', { reason: reasonOf(error) });
    } finally {
      setUploading(false);
    }
    // 途中で失敗しても、置けた分は選択肢に出す
    if (last !== null) await reloadClass();
    if (failure !== null) return { ok: false, notice: failure };
    if (last === null) return { ok: false, notice: t('imagePicker.upload.notImage') };

    const skipped = allImages.length < files.length ? t('imagePicker.upload.skipped') : sizeNotice;
    return { ok: true, value: last, notice: renamedNotice(renamed) ?? skipped };
  };

  return {
    uploading,
    reloading,
    baseUrl,
    srcOf: (value) => comfyPort().inputImages.src(baseUrl, value),
    upload,
    reload: () => {
      void reloadClass();
    },
  };
}
