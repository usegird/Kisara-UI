import {
  fetchBytes,
  fetchBytesStamped,
  fetchJson,
  postJson,
  type RequestOptions,
} from '@/comfy/client';
import { historyItemUrl, historyUrl, queueUrl, viewUrl } from '@/comfy/endpoints';
import { imageMimeType } from '@/comfy/outputs';
import { parseHistory, parseHistoryDetail, parseQueue } from '@/comfy/schema';
import { isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';
import { readPngTextChunks } from '@/lib/png-text';
import type { OutputFileRef, OutputImageBody } from '@/port/files';
import type { HistoryDetail, HistoryResult, QueueSnapshot } from '@/port/history';

export function fetchQueue(baseUrl: string, options: RequestOptions = {}): Promise<QueueSnapshot> {
  return fetchJson(queueUrl(baseUrl), options).then(parseQueue);
}

export async function deleteQueued(
  baseUrl: string,
  promptId: string,
  options: RequestOptions = {},
): Promise<void> {
  await postJson(queueUrl(baseUrl), { delete: [promptId] }, options);
}

export const HISTORY_PAGE_SIZE = 100;

const HISTORY_PAGE_LIMIT = 100;

export async function fetchHistory(
  baseUrl: string,
  maxItems: number | undefined,
  options: RequestOptions = {},
): Promise<HistoryResult> {
  if (maxItems !== undefined) {
    const raw = await fetchJson(historyUrl(baseUrl, { maxItems }), options);
    return { entries: parseHistory(raw), raw: isRecord(raw) ? raw : {} };
  }
  const all: Record<string, unknown> = {};
  for (let page = 0; page < HISTORY_PAGE_LIMIT; page += 1) {
    const offset = page * HISTORY_PAGE_SIZE;
    const raw = await fetchJson(
      historyUrl(baseUrl, { maxItems: HISTORY_PAGE_SIZE, offset }),
      options,
    );
    if (!isRecord(raw)) break;
    const keys = Object.keys(raw);
    const fresh = keys.filter((key) => !Object.hasOwn(all, key));
    for (const key of fresh) setOwn(all, key, raw[key]);
    if (fresh.length === 0 || keys.length < HISTORY_PAGE_SIZE) break;
  }
  return { entries: parseHistory(all), raw: all };
}

export async function fetchHistoryItem(
  baseUrl: string,
  promptId: string,
  options: RequestOptions = {},
): Promise<HistoryDetail | null> {
  const raw = await fetchJson(historyItemUrl(baseUrl, promptId), options);

  return parseHistoryDetail(raw, promptId);
}

export function fetchPromptFromImage(
  baseUrl: string,
  file: OutputFileRef,
  options: RequestOptions = {},
): Promise<Readonly<Record<string, unknown>> | null> {
  return fetchImageJson(baseUrl, file, 'prompt', options);
}

export function fetchWorkflowFromImage(
  baseUrl: string,
  file: OutputFileRef,
  options: RequestOptions = {},
): Promise<Readonly<Record<string, unknown>> | null> {
  return fetchImageJson(baseUrl, file, 'workflow', options);
}

async function fetchImageJson(
  baseUrl: string,
  file: OutputFileRef,
  key: string,
  options: RequestOptions,
): Promise<Readonly<Record<string, unknown>> | null> {
  const url = viewUrl(baseUrl, {
    filename: file.filename,
    type: file.type,
    subfolder: file.subfolder,
  });

  const text = readPngTextChunks(await fetchBytes(url, options)).get(key);
  if (text === undefined) return null;

  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function fetchOutputImage(
  baseUrl: string,
  file: OutputFileRef,
  options: RequestOptions = {},
): Promise<OutputImageBody> {
  const url = viewUrl(baseUrl, {
    filename: file.filename,
    type: file.type,
    subfolder: file.subfolder,
  });

  const { bytes, modifiedAt } = await fetchBytesStamped(url, options);
  return { blob: new Blob([bytes], { type: imageMimeType(file.filename) }), modifiedAt };
}
