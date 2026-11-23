import { ComfyRequestError, fetchJson, postText, type RequestOptions } from '@/comfy/client';
import { userdataFileUrl, userdataListUrl, userdataWriteUrl } from '@/comfy/endpoints';
import { developerMessage, isNotFound } from '@/comfy/request-error';
import { isKisaraCreated } from '@/graph/created-mark';
import { workflowDisplayName } from '@/graph/workflow-name';
import { finiteNumber, isRecord, isUnknownArray } from '@/lib/guards';
import type { ComfyFailure, ComfyFailureParams } from '@/port/connection';
import type { SavedWorkflow } from '@/port/workflows';

const WORKFLOW_DIR = 'workflows';
const HTTP_CONFLICT = 409;

export function parseSavedWorkflows(raw: unknown): SavedWorkflow[] {
  if (!isUnknownArray(raw)) return [];

  const list: SavedWorkflow[] = [];
  for (const entry of raw) {
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
  return list.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
}

export async function listSavedWorkflows(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<SavedWorkflow[]> {
  return parseSavedWorkflows(await fetchJson(userdataListUrl(baseUrl, WORKFLOW_DIR), options));
}

export function fetchSavedWorkflow(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return fetchJson(userdataFileUrl(baseUrl, WORKFLOW_DIR, path), options);
}

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
