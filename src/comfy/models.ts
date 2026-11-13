import { fetchJson, fetchText, type RequestOptions } from '@/comfy/client';
import {
  modelListUrl,
  modelMetadataUrl,
  modelNotesProbeUrl,
  modelNotesUrl,
  modelPreviewUrl,
} from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { parseModelFiles, parseModelMetadata } from '@/comfy/schema';
import type { ModelFile } from '@/graph/model-files';

// ─────────────────────────────
// モデルファイルの一覧・プレビュー画像・埋め込みの metadata・同名のメモを取る。
// ─────────────────────────────

/**
 * 種別ごとのモデルファイルの一覧。**持たない接続先がある前提**で、404 なら呼び出し側は一覧なしで進める
 * （選択肢そのものは `/object_info` 側から取れているので、画面は成立する）
 */
export async function fetchModelFiles(
  baseUrl: string,
  folder: string,
  options: RequestOptions = {},
): Promise<ModelFile[]> {
  return parseModelFiles(await fetchJson(modelListUrl(baseUrl, folder), options));
}

/**
 * モデルに埋め込まれた metadata。**無いのが普通**（safetensors 以外・metadata 無しは 404）。
 * 無いことは失敗ではないので、404 は空として返す。
 */
export async function fetchModelMetadata(
  baseUrl: string,
  folder: string,
  filename: string,
  options: RequestOptions = {},
): Promise<Map<string, string>> {
  try {
    return parseModelMetadata(
      await fetchJson(modelMetadataUrl(baseUrl, folder, filename), options),
    );
  } catch (error) {
    if (isNotFound(error)) return new Map();
    throw error;
  }
}

/**
 * モデルと同名の `.txt`（pysssss が書いたメモ）。**読むだけ**（書くのは `kisara/`）。
 * 無い・拡張が無いときは null（どちらも失敗ではない）。
 * 拡張の情報の経路は sha256 を計算して書き出すので使わない。
 */
export async function fetchModelNotes(
  baseUrl: string,
  folder: string,
  filename: string,
  options: RequestOptions = {},
): Promise<string | null> {
  try {
    return await fetchText(modelNotesUrl(baseUrl, folder, filename), options);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * メモを扱う拡張（pysssss）が接続先にあるか。無ければ false（失敗ではない）。
 * 応答の中身は使わない（経路があることだけを見る）。
 */
export async function hasModelNotesRoute(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<boolean> {
  try {
    await fetchJson(modelNotesProbeUrl(baseUrl), options);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/** カードに出す画像の URL。一覧を引けていないものには出せないので null */
export function modelPreviewSrc(
  baseUrl: string,
  folder: string,
  file: ModelFile | null,
): string | null {
  if (file === null || baseUrl.length === 0) return null;

  return modelPreviewUrl(baseUrl, { folder, pathIndex: file.pathIndex, name: file.name });
}
