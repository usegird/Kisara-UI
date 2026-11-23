import { developerMessage } from '@/comfy/request-error';
import { parseHttpBaseUrl } from '@/lib/web-url';
import type { ComfyFailure, ComfyFailureParams } from '@/port/connection';

const NOTES_EXTENSION = '.txt';
const JSON_EXTENSION = '.json';

type BaseUrlReason = Extract<
  ComfyFailure['reasonCode'],
  'base-url-empty' | 'base-url-scheme' | 'base-url-invalid'
>;

export class InvalidBaseUrlError extends Error implements ComfyFailure {
  readonly reasonCode: BaseUrlReason;
  readonly params: ComfyFailureParams;

  constructor(reasonCode: BaseUrlReason, baseUrl: string, options?: ErrorOptions) {
    const params = reasonCode === 'base-url-empty' ? {} : { url: baseUrl };
    super(developerMessage(reasonCode, params), options);
    this.name = 'InvalidBaseUrlError';
    this.reasonCode = reasonCode;
    this.params = params;
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  const parsed = parseHttpBaseUrl(baseUrl);
  if (parsed.kind === 'ok') return parsed.url;
  if (parsed.kind === 'invalid') {
    throw new InvalidBaseUrlError('base-url-invalid', baseUrl, { cause: parsed.cause });
  }
  throw new InvalidBaseUrlError(
    parsed.kind === 'empty' ? 'base-url-empty' : 'base-url-scheme',
    baseUrl,
  );
}

function path(baseUrl: string, ...segments: string[]): string {
  const encoded = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return `${normalizeBaseUrl(baseUrl)}/${encoded}`;
}

export function featuresUrl(baseUrl: string): string {
  return path(baseUrl, 'features');
}

export function objectInfoUrl(baseUrl: string): string {
  return path(baseUrl, 'object_info');
}

export function systemStatsUrl(baseUrl: string): string {
  return path(baseUrl, 'system_stats');
}

export function objectInfoClassUrl(baseUrl: string, className: string): string {
  return path(baseUrl, 'object_info', className);
}

export function promptUrl(baseUrl: string): string {
  return path(baseUrl, 'prompt');
}

export function interruptUrl(baseUrl: string): string {
  return path(baseUrl, 'interrupt');
}

interface ViewParams {
  readonly filename: string;
  readonly type?: string;
  readonly subfolder?: string;
}

export function uploadImageUrl(baseUrl: string): string {
  return path(baseUrl, 'upload', 'image');
}

export function viewUrl(baseUrl: string, params: ViewParams): string {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/view`);
  url.searchParams.set('filename', params.filename);
  if (params.type !== undefined) url.searchParams.set('type', params.type);
  if (params.subfolder !== undefined) url.searchParams.set('subfolder', params.subfolder);
  return url.toString();
}

export function userdataListUrl(baseUrl: string, dir: string): string {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/userdata`);
  url.searchParams.set('dir', dir);
  url.searchParams.set('recurse', 'true');
  url.searchParams.set('split', 'false');
  url.searchParams.set('full_info', 'true');
  return url.toString();
}

export function userdataItemUrl(baseUrl: string, path: string): string {
  const id = encodeURIComponent(path.replaceAll('%', '%25'));
  return `${normalizeBaseUrl(baseUrl)}/userdata/${id}`;
}

export function userdataWriteUrl(baseUrl: string, path: string, overwrite: boolean): string {
  return `${userdataItemUrl(baseUrl, path)}?overwrite=${String(overwrite)}`;
}

export function userdataFileUrl(baseUrl: string, dir: string, path: string): string {
  return userdataItemUrl(baseUrl, `${dir}/${path}`);
}

export function queueUrl(baseUrl: string): string {
  return path(baseUrl, 'queue');
}

export function historyUrl(
  baseUrl: string,
  options: { maxItems?: number | undefined; offset?: number | undefined } = {},
): string {
  const url = path(baseUrl, 'history');
  if (options.maxItems === undefined) return url;
  const offset = options.offset === undefined ? '' : `&offset=${String(options.offset)}`;
  return `${url}?max_items=${String(options.maxItems)}${offset}`;
}

export function historyItemUrl(baseUrl: string, promptId: string): string {
  return path(baseUrl, 'history', promptId);
}

export function templateIndexUrl(baseUrl: string, locale?: string): string {
  return path(baseUrl, 'templates', locale === undefined ? 'index.json' : `index.${locale}.json`);
}

export function templateFileUrl(baseUrl: string, file: string): string {
  return path(baseUrl, 'templates', file);
}

export function nodeFrequencyUrl(baseUrl: string): string {
  return path(baseUrl, 'assets', 'sorted-custom-node-map.json');
}

export function websocketUrl(baseUrl: string, clientId: string): string {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('clientId', clientId);
  return url.toString();
}

export function wildcardListUrl(baseUrl: string): string {
  return path(baseUrl, 'impact', 'wildcards', 'list');
}

export function wildcardExpandUrl(baseUrl: string): string {
  return path(baseUrl, 'impact', 'wildcards');
}

export function modelListUrl(baseUrl: string, folder: string): string {
  return path(baseUrl, 'experiment', 'models', folder);
}

interface ModelPreviewParams {
  readonly folder: string;
  readonly pathIndex: number;
  readonly name: string;
}

export function modelPreviewUrl(baseUrl: string, params: ModelPreviewParams): string {
  const name = params.name
    .split(/[\\/]/)
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const prefix = path(baseUrl, 'experiment', 'models', 'preview', params.folder);

  return `${prefix}/${String(params.pathIndex)}/${name}`;
}

export function modelMetadataUrl(baseUrl: string, folder: string, filename: string): string {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/view_metadata/${encodeURIComponent(folder)}`);
  url.searchParams.set('filename', filename);
  return url.toString();
}

export function modelNotesUrl(baseUrl: string, folder: string, filename: string): string {
  return pysssssSiblingUrl(baseUrl, folder, filename, NOTES_EXTENSION);
}

export function modelJsonUrl(baseUrl: string, folder: string, filename: string): string {
  return pysssssSiblingUrl(baseUrl, folder, filename, JSON_EXTENSION);
}

function pysssssSiblingUrl(
  baseUrl: string,
  folder: string,
  filename: string,
  extension: string,
): string {
  const stem = filename.replace(/\.[^./\\]*$/, '');
  return path(baseUrl, 'pysssss', 'view', `${folder}/${stem}${extension}`);
}

export function modelNotesProbeUrl(baseUrl: string): string {
  return path(baseUrl, 'pysssss', 'loras');
}

export function pysssssTagsUrl(baseUrl: string): string {
  return path(baseUrl, 'pysssss', 'autocomplete');
}

export function managerVersionUrl(baseUrl: string): string {
  return path(baseUrl, 'manager', 'version');
}

export function managerMappingsUrl(baseUrl: string): string {
  return `${path(baseUrl, 'customnode', 'getmappings')}?mode=cache`;
}

export function managerInstallUrl(baseUrl: string): string {
  return path(baseUrl, 'manager', 'queue', 'install');
}

export function managerQueueStartUrl(baseUrl: string): string {
  return path(baseUrl, 'manager', 'queue', 'start');
}

export function managerRebootUrl(baseUrl: string): string {
  return path(baseUrl, 'manager', 'reboot');
}
