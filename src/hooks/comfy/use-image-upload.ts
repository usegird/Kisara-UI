import { useState } from 'react';

import { t } from '@/i18n';
import { IMAGE_FILE_MAX_BYTES, isTooLarge, wholeMegabytes } from '@/lib/file-size';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';

export type UploadOutcome =
  | {
      readonly ok: true;
      readonly value: string;
      readonly notice: string | null;
    }
  | { readonly ok: false; readonly notice: string };

export interface ImageUpload {
  readonly uploading: boolean;
  readonly reloading: boolean;
  readonly baseUrl: string;
  readonly srcOf: (value: string) => string | null;
  readonly upload: (files: readonly File[]) => Promise<UploadOutcome>;
  readonly reload: () => void;
}

function reasonOf(error: unknown): string {
  return formatComfyFailure(error);
}

function renamedNotice(renamed: readonly string[]): string | null {
  return renamed.length === 0
    ? null
    : t('imagePicker.upload.renamed', { names: renamed.join(', ') });
}

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
