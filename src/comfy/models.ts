import { fetchJson, fetchText, type RequestOptions } from '@/comfy/client';
import {
  modelJsonUrl,
  modelListUrl,
  modelMetadataUrl,
  modelNotesProbeUrl,
  modelNotesUrl,
  modelPreviewUrl,
} from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { parseModelFiles, parseModelMetadata } from '@/comfy/schema';
import type { ModelFile } from '@/graph/model-files';
import { parseModelJsonEntries, type ModelJsonEntry } from '@/graph/model-metadata';

export async function fetchModelFiles(
  baseUrl: string,
  folder: string,
  options: RequestOptions = {},
): Promise<ModelFile[]> {
  return parseModelFiles(await fetchJson(modelListUrl(baseUrl, folder), options));
}

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

export async function fetchModelJson(
  baseUrl: string,
  folder: string,
  filename: string,
  options: RequestOptions = {},
): Promise<ModelJsonEntry[] | null> {
  let text: string;
  try {
    text = await fetchText(modelJsonUrl(baseUrl, folder, filename), options);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const parsed = parseModelJsonEntries(JSON.parse(text));
  if (parsed === null) throw new SyntaxError('not an object');
  return parsed;
}

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

export function modelPreviewSrc(
  baseUrl: string,
  folder: string,
  file: ModelFile | null,
): string | null {
  if (file === null || baseUrl.length === 0) return null;

  return modelPreviewUrl(baseUrl, { folder, pathIndex: file.pathIndex, name: file.name });
}
