import { fetchJson, fetchText, postJson, type RequestOptions } from '@/comfy/client';
import {
  managerInstallUrl,
  managerMappingsUrl,
  managerQueueStartUrl,
  managerRebootUrl,
  managerVersionUrl,
} from '@/comfy/endpoints';
import { ComfyRequestError, isNotFound } from '@/comfy/request-error';
import { parseNodePackMappings } from '@/comfy/schema-manager';
import type { NodePackMapping } from '@/graph/node-packs';
import type { NodePackInstall } from '@/port/manager';

const MAPPINGS_TIMEOUT_MS = 60_000;

const DEFAULT_CHANNEL = 'default';
const CACHE_MODE = 'cache';
const LATEST_VERSION = 'latest';
const UNKNOWN_VERSION = 'unknown';

export async function fetchManagerVersion(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<string | null> {
  try {
    const text = (await fetchText(managerVersionUrl(baseUrl), options)).trim();
    return text.length === 0 ? null : text;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function fetchNodePackMappings(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<NodePackMapping[]> {
  const raw = await fetchJson(managerMappingsUrl(baseUrl), {
    timeoutMs: MAPPINGS_TIMEOUT_MS,
    ...options,
  });
  return parseNodePackMappings(raw);
}

export async function installNodePack(
  baseUrl: string,
  pack: NodePackInstall,
  options: RequestOptions = {},
): Promise<void> {
  await postJson(managerInstallUrl(baseUrl), installBody(pack), options);
  await postJson(managerQueueStartUrl(baseUrl), {}, options);
}

export async function rebootComfy(baseUrl: string, options: RequestOptions = {}): Promise<void> {
  try {
    await postJson(managerRebootUrl(baseUrl), {}, options);
  } catch (error) {
    if (error instanceof ComfyRequestError && error.kind === 'unreachable') return;
    throw error;
  }
}

function installBody(pack: NodePackInstall): Record<string, unknown> {
  const common = {
    channel: DEFAULT_CHANNEL,
    mode: CACHE_MODE,
    ui_id: pack.key,
    skip_post_install: false,
  };
  if (pack.registry) {
    return { ...common, id: pack.key, version: LATEST_VERSION, selected_version: LATEST_VERSION };
  }
  return {
    ...common,
    id: pack.key,
    version: UNKNOWN_VERSION,
    selected_version: UNKNOWN_VERSION,
    files: [pack.key],
    pip: [],
  };
}
