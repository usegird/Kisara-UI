import { ComfyRequestError, fetchJson, postText, type RequestOptions } from '@/comfy/client';
import { userdataFileUrl, userdataListUrl, userdataWriteUrl } from '@/comfy/endpoints';
import { developerMessage, isNotFound } from '@/comfy/request-error';
import { isKisaraCreated } from '@/graph/created-mark';
import { workflowDisplayName } from '@/graph/workflow-name';
import { finiteNumber, isRecord, isUnknownArray } from '@/lib/guards';
import type { ComfyFailure, ComfyFailureParams } from '@/port/connection';
import type { SavedWorkflow } from '@/port/workflows';

// ─────────────────────────────
// ComfyUI に保存されているワークフローの読み取りと保存（削除・移動はしない）。
// ─────────────────────────────

/** ComfyUI がワークフローを置くディレクトリ */
const WORKFLOW_DIR = 'workflows';
/** 置き換えない書き込みで、同じ名前が既にあったときの HTTP の状態 */
const HTTP_CONFLICT = 409;

/** `workflows/` の一覧の応答を、保存済みワークフローの並び（新しい順）にする。形が違えば空 */
export function parseSavedWorkflows(raw: unknown): SavedWorkflow[] {
  if (!isUnknownArray(raw)) return [];

  const list: SavedWorkflow[] = [];
  for (const entry of raw) {
    // 旧い応答は文字列の配列（full_info なし）でも返りうるので両方受ける
    if (typeof entry === 'string') {
      list.push({ path: entry, name: workflowDisplayName(entry), size: null, modified: null });
      continue;
    }
    if (!isRecord(entry) || typeof entry.path !== 'string') continue;

    list.push({
      path: entry.path,
      name: workflowDisplayName(entry.path),
      size: finiteNumber(entry.size),
      modified: finiteNumber(entry.modified),
    });
  }
  // 新しいものから並べる（一覧の既定の並びは保証されない）
  return list.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
}

/** 接続先に保存されているワークフローの一覧を取る */
export async function listSavedWorkflows(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<SavedWorkflow[]> {
  return parseSavedWorkflows(await fetchJson(userdataListUrl(baseUrl, WORKFLOW_DIR), options));
}

/** 中身は Workflow JSON そのもの。検証は `parseWorkflow` に任せる */
export function fetchSavedWorkflow(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return fetchJson(userdataFileUrl(baseUrl, WORKFLOW_DIR, path), options);
}

/** 同じ名前が既にあるときに投げる。KisaraUI が作ったファイルか（`owned`）を添える */
export class WorkflowExistsError extends Error implements ComfyFailure {
  readonly path: string;
  readonly owned: boolean;
  readonly reasonCode = 'workflow-exists';
  readonly params: ComfyFailureParams;

  constructor(path: string, owned: boolean) {
    super(developerMessage('workflow-exists', { path }));
    this.name = 'WorkflowExistsError';
    this.path = path;
    this.owned = owned;
    this.params = { path };
  }
}

/**
 * 上書きしようとした先が、KisaraUI の作ったファイルでなかった。書いていない
 */
export class WorkflowNotOwnedError extends Error implements ComfyFailure {
  readonly path: string;
  readonly reasonCode = 'workflow-not-owned';
  readonly params: ComfyFailureParams;

  constructor(path: string) {
    super(developerMessage('workflow-not-owned', { path }));
    this.name = 'WorkflowNotOwnedError';
    this.path = path;
    this.params = { path };
  }
}

type Owner = 'missing' | 'own' | 'foreign';

/** 今あるファイルの作り手。JSON として読めない中身は KisaraUI が作っていない扱い */
async function ownerOf(baseUrl: string, path: string, options: RequestOptions): Promise<Owner> {
  let raw: unknown;
  try {
    raw = await fetchJson(userdataFileUrl(baseUrl, WORKFLOW_DIR, path), {
      cache: 'no-store',
      ...options,
    });
  } catch (error) {
    if (isNotFound(error)) return 'missing';
    if (error instanceof ComfyRequestError && error.kind === 'parse') return 'foreign';
    throw error;
  }
  return isKisaraCreated(raw) ? 'own' : 'foreign';
}

/**
 * ComfyUI に保存する。**本文はそのまま**送る（`/userdata` はファイルの中身を生で受ける）。
 * 既存を上書きするときだけ `overwrite: true` を渡すこと（既定は上書きしない）。
 *
 * **上書きは KisaraUI が作ったファイルにだけ行う**。書く直前に上書きする先を読み、
 * 作った印が無ければ書かずに `WorkflowNotOwnedError` を投げる。先が無くなっていれば上書きの指定を
 * 外して作る（その間に誰かが置いたら 409 で止まる）。同名で止まったら、その作り手を添えて投げる
 */
export async function saveWorkflow(
  baseUrl: string,
  path: string,
  content: string,
  options: { overwrite?: boolean } & RequestOptions = {},
): Promise<void> {
  const { overwrite = false, ...request } = options;
  let replace = false;
  if (overwrite) {
    const owner = await ownerOf(baseUrl, path, request);
    if (owner === 'foreign') throw new WorkflowNotOwnedError(path);
    replace = owner === 'own';
  }

  try {
    await postText(userdataWriteUrl(baseUrl, `${WORKFLOW_DIR}/${path}`, replace), content, request);
  } catch (error) {
    if (error instanceof ComfyRequestError && error.status === HTTP_CONFLICT) {
      throw new WorkflowExistsError(path, (await ownerOf(baseUrl, path, request)) === 'own');
    }
    throw error;
  }
}
