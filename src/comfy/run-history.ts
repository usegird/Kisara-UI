import { ComfyRequestError, fetchJson, postText, type RequestOptions } from '@/comfy/client';
import { userdataFileUrl, userdataListUrl, userdataWriteUrl } from '@/comfy/endpoints';
import { isNotFound } from '@/comfy/request-error';
import { parseOutputFiles, sessionOf } from '@/comfy/schema';
import { outputPath, type SlotNode, type ValueSlot } from '@/graph/run-record';
import { finiteNumber, isRecord, isUnknownArray } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';
import type {
  HistoryRunSource,
  PromptRoleMark,
  PromptSlot,
  RunHistoryEntry,
  RunHistoryFile,
  RunHistoryRead,
  RunHistoryRun,
  RunHistoryWorkflow,
} from '@/port/run-history';

// ─────────────────────────────
// 実行の記録の読み書きと形の検証。読んだ中身は自分が書いたものでも未確定として受け、形を確かめてから使う。
// ─────────────────────────────

/** 記録を置くディレクトリ（ユーザーフォルダからの相対） */
export const RUN_HISTORY_DIR = 'kisara/history';

/**
 * 形式の版。この版だけを読み書きし、ほかの版は読まない
 */
const RUN_HISTORY_VERSION = 5;

// ─────────────────────────────
// 形の検証
// ─────────────────────────────

const ROLE_MARKS: readonly unknown[] = ['posi', 'nega', null];

function isRoleMark(value: unknown): value is PromptRoleMark {
  return ROLE_MARKS.includes(value);
}

/** `[ノード id, 入力名, …]` */
function slotHead(raw: unknown): ValueSlot | null {
  if (!isUnknownArray(raw)) return null;
  const [nodeId, input] = raw;
  return typeof nodeId === 'string' && typeof input === 'string' ? [nodeId, input] : null;
}

function parsePromptSlot(raw: unknown): PromptSlot | null {
  const head = slotHead(raw);
  const role = isUnknownArray(raw) ? (raw[2] ?? null) : undefined;
  return head === null || !isRoleMark(role) ? null : [...head, role];
}

/** 並びのどれかが読めなければ null（置き場がずれるので骨組みごと外す） */
function parseAll<T>(raw: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!isUnknownArray(raw)) return null;
  const items = raw.map(parse);
  return items.every((item) => item !== null) ? items : null;
}

function parseNames(raw: unknown): string[] | null {
  return parseAll(raw, (item) => (typeof item === 'string' ? item : null));
}

/** `[ノード名]` か `[ノード名, コメント]` */
function parseSlotNode(raw: unknown): SlotNode | null {
  if (!isUnknownArray(raw) || typeof raw[0] !== 'string') return null;
  const [name, comment] = raw;
  return typeof comment === 'string' ? [name, comment] : [name];
}

/** 置き場のノードの定義。読めない 1 件は外す（表示はノード id だけになる） */
function parseSlotNodes(raw: unknown): Record<string, SlotNode> {
  if (!isRecord(raw)) return {};
  const nodes: Record<string, SlotNode> = {};
  for (const [id, value] of Object.entries(raw)) {
    const node = parseSlotNode(value);
    if (node !== null) setOwn(nodes, id, node);
  }
  return nodes;
}

function parseWorkflowEntry(raw: unknown): RunHistoryWorkflow | null {
  if (!isRecord(raw)) return null;
  const model = parseNames(raw.model);
  const lora = parseNames(raw.lora);
  const other = parseNames(raw.other);
  const seeds = parseAll(raw.seeds, slotHead);
  const prompts = parseAll(raw.prompts, parsePromptSlot);
  if (model === null || lora === null || other === null) return null;
  if (seeds === null || prompts === null) return null;

  return {
    model,
    lora,
    other,
    nodes: parseSlotNodes(raw.nodes),
    seeds,
    prompts,
    ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
  };
}

/** 1 件を読む（`[開始, 完了, パス, 骨組みのキー, プロンプトのキー, シード]`） */
function parseRun(raw: unknown): RunHistoryRun | null {
  if (!isUnknownArray(raw)) return null;
  const [start, finished, paths, workflow, prompt, seeds] = raw;
  const end = finiteNumber(finished);
  const startedAt = finiteNumber(start);
  if (startedAt === null || !isUnknownArray(paths)) return null;

  return {
    start: startedAt,
    end,
    paths: paths.filter((path) => typeof path === 'string'),
    workflow: typeof workflow === 'string' ? workflow : null,
    prompt: typeof prompt === 'string' ? prompt : null,
    seeds: isUnknownArray(seeds) ? seeds : [],
  };
}

/** 記録のファイルを読む。形が違えば null（そのファイルだけを外し、上書きしない） */
export function parseRunHistoryFile(raw: unknown): RunHistoryFile | null {
  if (!isRecord(raw) || raw.v !== RUN_HISTORY_VERSION) return null;
  if (!isRecord(raw.workflows) || !isRecord(raw.prompts) || !isUnknownArray(raw.runs)) return null;

  const workflows: Record<string, RunHistoryWorkflow> = {};
  for (const [key, value] of Object.entries(raw.workflows)) {
    const entry = parseWorkflowEntry(value);
    if (entry !== null) setOwn(workflows, key, entry);
  }
  const prompts: Record<string, readonly unknown[]> = {};
  for (const [key, value] of Object.entries(raw.prompts)) {
    if (isUnknownArray(value)) setOwn(prompts, key, value);
  }
  const runs = raw.runs.map(parseRun).filter((run) => run !== null);
  const name = typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : undefined;
  return { workflows, prompts, runs, ...(name === undefined ? {} : { name }) };
}

/**
 * 書く形の文字列にする。1 件は配列にし、無い項目は後ろから省く
 */
export function serializeRunHistoryFile(file: RunHistoryFile): string {
  const runs = file.runs.map((run) => {
    if (run.workflow === null) return [run.start, run.end, run.paths];
    return [run.start, run.end, run.paths, run.workflow, run.prompt, run.seeds];
  });
  return JSON.stringify({
    v: RUN_HISTORY_VERSION,
    workflows: file.workflows,
    prompts: file.prompts,
    runs,
    ...(file.name === undefined ? {} : { name: file.name }),
  });
}

// ─────────────────────────────
// `/history` から記録の材料を読む
// ─────────────────────────────

/** `status.messages` の最初と最後の時刻（種別名には依存しない） */
function timestamps(status: unknown): { first: number | null; last: number | null } {
  if (!isRecord(status) || !isUnknownArray(status.messages)) return { first: null, last: null };
  let first: number | null = null;
  let last: number | null = null;
  for (const message of status.messages) {
    const detail = isUnknownArray(message) ? message[1] : null;
    const stamp = isRecord(detail) ? finiteNumber(detail.timestamp) : null;
    if (stamp === null) continue;
    if (first === null || stamp < first) first = stamp;
    if (last === null || stamp > last) last = stamp;
  }
  return { first, last };
}

function sentWorkflow(prompt: unknown): unknown {
  const extra = isUnknownArray(prompt) ? prompt[3] : null;
  const pnginfo = isRecord(extra) ? extra.extra_pnginfo : null;
  return isRecord(pnginfo) && pnginfo.workflow !== undefined ? pnginfo.workflow : null;
}

/** `GET /history` の応答から、記録の材料を 1 件ずつ取り出す。読めない 1 件は外す */
export function parseHistoryRuns(raw: unknown): HistoryRunSource[] {
  if (!isRecord(raw)) return [];

  const sources: HistoryRunSource[] = [];
  for (const [promptId, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const outputs = isRecord(value.outputs)
      ? Object.values(value.outputs).flatMap((output) => parseOutputFiles(output))
      : [];
    // 保存していない出力（`temp`）も残す。置き場は LoadImage の値と同じ印で書く
    const paths = outputs.map(outputPath);

    const times = timestamps(value.status);
    sources.push({
      promptId,
      startedAt: times.first,
      finishedAt: times.last,
      paths,
      workflow: sentWorkflow(value.prompt),
      session: isUnknownArray(value.prompt) ? sessionOf(value.prompt[3]) : null,
    });
  }
  return sources;
}

// ─────────────────────────────
// 読み書き
// ─────────────────────────────

/** 一覧の 1 件。`full_info` の形（`{path, modified}`）と、名前だけの形の両方を読む */
function listEntry(raw: unknown): RunHistoryEntry | null {
  const name = isRecord(raw) ? raw.path : raw;
  if (typeof name !== 'string' || !name.endsWith('.json')) return null;
  return { name, modified: isRecord(raw) ? finiteNumber(raw.modified) : null };
}

/** 記録のファイルの一覧（名前と最後に書いた時刻）。ディレクトリがまだ無ければ空 */
export async function listRunHistoryFiles(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<RunHistoryEntry[]> {
  try {
    // 書き足しの直後に読むので、ブラウザのキャッシュを通さない（古い中身で合わせない）
    const raw = await fetchJson(userdataListUrl(baseUrl, RUN_HISTORY_DIR), {
      cache: 'no-store',
      ...options,
    });
    if (!isUnknownArray(raw)) return [];
    return raw.map(listEntry).filter((entry) => entry !== null);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

/** 1 ファイルを読む。無い・形が違うも結果で返す（書き手は形の違うファイルを上書きしない） */
export async function fetchRunHistoryFile(
  baseUrl: string,
  name: string,
  options: RequestOptions = {},
): Promise<RunHistoryRead> {
  const url = userdataFileUrl(baseUrl, RUN_HISTORY_DIR, name);
  let raw: unknown;
  try {
    raw = await fetchJson(url, { cache: 'no-store', ...options });
  } catch (error) {
    if (isNotFound(error)) return { kind: 'missing' };
    // JSON でない中身も形の違うファイルとして扱う
    if (error instanceof ComfyRequestError && error.kind === 'parse') return { kind: 'unreadable' };
    throw error;
  }
  const file = parseRunHistoryFile(raw);
  return file === null ? { kind: 'unreadable' } : { kind: 'file', file };
}

/** ファイル全体を上書きする */
export async function saveRunHistoryFile(
  baseUrl: string,
  name: string,
  file: RunHistoryFile,
  options: RequestOptions = {},
): Promise<void> {
  const url = userdataWriteUrl(baseUrl, `${RUN_HISTORY_DIR}/${name}`, true);
  await postText(url, serializeRunHistoryFile(file), options);
}
