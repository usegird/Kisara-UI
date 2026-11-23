import { ComfyRequestError, postForm, type RequestOptions } from '@/comfy/client';
import { uploadImageUrl, viewUrl } from '@/comfy/endpoints';
import { parseUploadedImage } from '@/comfy/schema';
import { imageFileValue } from '@/graph/image-options';
import { toSlashPath } from '@/lib/file-name';
import type { UploadedImage } from '@/port/files';

interface InputImageRef {
  readonly filename: string;
  readonly subfolder: string;
  readonly type: string;
}

const ANNOTATED = /^(.*) \[(input|output|temp)\]$/u;

export function inputImageRef(value: string): InputImageRef | null {
  const annotated = ANNOTATED.exec(value);
  const name = toSlashPath(annotated?.[1] ?? value);
  const type = annotated?.[2] ?? 'input';

  const cut = name.lastIndexOf('/');
  const filename = cut < 0 ? name : name.slice(cut + 1);
  if (filename.length === 0) return null;
  return { filename, subfolder: cut < 0 ? '' : name.slice(0, cut), type };
}

export function inputImageSrc(baseUrl: string, value: string): string | null {
  const ref = inputImageRef(value);
  if (ref === null || baseUrl.length === 0) return null;
  try {
    return viewUrl(baseUrl, ref);
  } catch {
    return null;
  }
}

export function uploadedImageValue(image: UploadedImage): string {
  return imageFileValue({ filename: image.name, subfolder: image.subfolder, type: image.type });
}

async function upload(
  baseUrl: string,
  file: File,
  { type, subfolder }: { readonly type: 'input' | 'temp'; readonly subfolder: string },
  options: RequestOptions,
): Promise<string> {
  const url = uploadImageUrl(baseUrl);
  const form = new FormData();
  form.append('image', file, file.name);
  form.append('type', type);
  if (subfolder.length > 0) form.append('subfolder', subfolder);

  const image = parseUploadedImage(await postForm(url, form, options));
  if (image === null) {
    throw new ComfyRequestError('parse', url, { reasonCode: 'upload-unexpected' });
  }
  return uploadedImageValue(image);
}

export function uploadInputImage(
  baseUrl: string,
  file: File,
  options: RequestOptions = {},
): Promise<string> {
  return upload(baseUrl, file, { type: 'input', subfolder: '' }, options);
}

export function uploadTempImage(
  baseUrl: string,
  file: File,
  subfolder: string,
  options: RequestOptions = {},
): Promise<string> {
  return upload(baseUrl, file, { type: 'temp', subfolder }, options);
}
