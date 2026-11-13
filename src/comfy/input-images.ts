import { ComfyRequestError, postForm, type RequestOptions } from '@/comfy/client';
import { uploadImageUrl, viewUrl } from '@/comfy/endpoints';
import { parseUploadedImage } from '@/comfy/schema';
import { imageFileValue } from '@/graph/image-options';
import { toSlashPath } from '@/lib/file-name';
import type { UploadedImage } from '@/port/files';

// ─────────────────────────────
// 入力画像の取り口とアップロード。選択肢の値（`サブフォルダ/名前 [置き場]`）と `/view` の引数を読み替える。
// ─────────────────────────────

/** `/view` で入力画像を取るときの引数 */
interface InputImageRef {
  readonly filename: string;
  readonly subfolder: string;
  /** 置き場（`input` / `output` / `temp`） */
  readonly type: string;
}

const ANNOTATED = /^(.*) \[(input|output|temp)\]$/u;

/** 選択肢の値を `/view` の引数にする。空なら null */
export function inputImageRef(value: string): InputImageRef | null {
  const annotated = ANNOTATED.exec(value);
  const name = toSlashPath(annotated?.[1] ?? value);
  const type = annotated?.[2] ?? 'input';

  const cut = name.lastIndexOf('/');
  const filename = cut < 0 ? name : name.slice(cut + 1);
  if (filename.length === 0) return null;
  return { filename, subfolder: cut < 0 ? '' : name.slice(0, cut), type };
}

/** カードに出す画像の URL。値か接続先が使えなければ null（名前だけの枠に落とす） */
export function inputImageSrc(baseUrl: string, value: string): string | null {
  const ref = inputImageRef(value);
  if (ref === null || baseUrl.length === 0) return null;
  try {
    return viewUrl(baseUrl, ref);
  } catch {
    return null;
  }
}

/** 置いた画像を選択肢の値にする（本体の書き方と同じ。入力フォルダなら印を付けない） */
export function uploadedImageValue(image: UploadedImage): string {
  return imageFileValue({ filename: image.name, subfolder: image.subfolder, type: image.type });
}

/** 置き場とサブフォルダを決めて置き、選択肢の値を返す。上書きは頼まない（同名なら接続先が別の名前を付ける） */
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

/**
 * 画像を入力フォルダへ置き、選択肢の値を返す。**上書きしない**。
 * 応答の形が違えば失敗として返す（置けたふりをしない）
 */
export function uploadInputImage(
  baseUrl: string,
  file: File,
  options: RequestOptions = {},
): Promise<string> {
  return upload(baseUrl, file, { type: 'input', subfolder: '' }, options);
}

/**
 * 画像を `temp/` の下のサブフォルダへ置き、`[temp]` 付きの選択肢の値を返す。
 * `temp/` は接続先が起動するたびに空にする。上書きしない
 */
export function uploadTempImage(
  baseUrl: string,
  file: File,
  subfolder: string,
  options: RequestOptions = {},
): Promise<string> {
  return upload(baseUrl, file, { type: 'temp', subfolder }, options);
}
