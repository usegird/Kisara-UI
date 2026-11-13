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

// ─────────────────────────────
// タスクキューと履歴の読み取り、実行前のタスクの取り消し、生成画像に埋まった実行内容の読み取り。
// ─────────────────────────────

/** キューを読む。自動ポーリングはせず、実行状態が動いたときに呼び直す */
export function fetchQueue(baseUrl: string, options: RequestOptions = {}): Promise<QueueSnapshot> {
  return fetchJson(queueUrl(baseUrl), options).then(parseQueue);
}

/**
 * `POST /queue` に `{ delete: [prompt_id] }`。**実行前のタスクだけ**をキューから外す
 * （走っている実行には効かない。`server.py` の `/queue`）。押されたときだけ呼ぶ。応答の中身は使わない
 */
export async function deleteQueued(
  baseUrl: string,
  promptId: string,
  options: RequestOptions = {},
): Promise<void> {
  await postJson(queueUrl(baseUrl), { delete: [promptId] }, options);
}

/**
 * 全件を読むときに 1 回で取る件数（1 回の応答を数 MB にしない）
 */
export const HISTORY_PAGE_SIZE = 100;

/** 全件を読むときに取りに行く回数の上限（ComfyUI が持つ履歴の上限 1 万件の分） */
const HISTORY_PAGE_LIMIT = 100;

/**
 * 履歴。`maxItems` を指定すると新しいものからその件数。省くと全件を、古い方から
 * `HISTORY_PAGE_SIZE` 件ずつ `offset` をずらして取る。
 * `offset` を知らない接続先は同じ分を返すので、新しい 1 件も無い回が来たら止める
 */
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
    // 履歴の鍵は prompt id（外から来た鍵）なので、親を差し替えない書き方で足す
    for (const key of fresh) setOwn(all, key, raw[key]);
    if (fresh.length === 0 || keys.length < HISTORY_PAGE_SIZE) break;
  }
  return { entries: parseHistory(all), raw: all };
}

/**
 * 1件の詳細（実行した内容そのもの）。ダイアログを開いたときと、会話から呼んだワークフローの結果を
 * 拾い直すときだけ取りに行く
 */
export async function fetchHistoryItem(
  baseUrl: string,
  promptId: string,
  options: RequestOptions = {},
): Promise<HistoryDetail | null> {
  const raw = await fetchJson(historyItemUrl(baseUrl, promptId), options);

  return parseHistoryDetail(raw, promptId);
}

/**
 * 生成画像に埋まっている API Prompt（PNG の `tEXt(prompt)`）。
 *
 * **ComfyUI の履歴はメモリ上にあり再起動で消える**ので、履歴が引けないときの拠り所にする。
 * 画像本体を落とすことになるため、履歴が使える間は呼ばない。
 */
export function fetchPromptFromImage(
  baseUrl: string,
  file: OutputFileRef,
  options: RequestOptions = {},
): Promise<Readonly<Record<string, unknown>> | null> {
  return fetchImageJson(baseUrl, file, 'prompt', options);
}

/**
 * 生成画像に埋まっている Workflow JSON（PNG の `tEXt(workflow)`）。記録からワークフローを
 * 開くときに読む。埋まっていない画像もある
 */
export function fetchWorkflowFromImage(
  baseUrl: string,
  file: OutputFileRef,
  options: RequestOptions = {},
): Promise<Readonly<Record<string, unknown>> | null> {
  return fetchImageJson(baseUrl, file, 'workflow', options);
}

/** PNG の `tEXt` の 1 つを JSON のオブジェクトとして読む。無い・読めなければ null */
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
    // 埋め込みが壊れていても画面は動かす
    return null;
  }
}

/**
 * 結果画像の中身。**画面の中に持っておくため**に取る（保存領域には書かない）。
 * `temp` は ComfyUI の再起動で消えるので、見えているうちに手元へ写す。
 * 更新時刻も返す（再起動の後に同じ名前で書かれた別の画像を見分ける）。
 */
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
