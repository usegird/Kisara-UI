import {
  EXPRESSION_IMAGE_TYPES,
  fromBase64,
  normalizeExpressionLabel,
} from '@/chat/avatar-expression';
import { withoutExtension } from '@/lib/file-name';
import { isRecord, isUnknownArray } from '@/lib/guards';

const CARD_FILE_NAME = 'card.json';
const EMOTION_ASSET_TYPE = 'emotion';
const EMBEDDED_PREFIX = 'embeded://';
const DATA_PREFIX = 'data:';
const BASE64_MARK = ';base64,';

const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export interface DroppedFile {
  readonly file: File;
  readonly path: string;
}

export interface ImportedExpression {
  readonly label: string;
  readonly image: Blob;
}

export interface ExpressionImport {
  readonly entries: readonly ImportedExpression[];
  readonly skipped: readonly string[];
}

export async function importExpressions(
  files: readonly DroppedFile[],
  maxBytes: number,
): Promise<ExpressionImport> {
  const card = files.find((item) => baseName(item.path).toLowerCase() === CARD_FILE_NAME);
  const read =
    card === undefined ? fromFileNames(files, maxBytes) : await fromCard(card, files, maxBytes);
  const byLabel = new Map<string, ImportedExpression>();
  for (const entry of read.entries) byLabel.set(entry.label, entry);
  return { entries: [...byLabel.values()], skipped: read.skipped };
}

function fromFileNames(files: readonly DroppedFile[], maxBytes: number): ExpressionImport {
  const entries: ImportedExpression[] = [];
  const skipped: string[] = [];
  for (const { file, path } of files) {
    const image = asImage(file, path, maxBytes);
    const label = normalizeExpressionLabel(withoutExtension(baseName(path)));
    if (image === null || label === null) skipped.push(baseName(path));
    else entries.push({ label, image });
  }
  return { entries, skipped };
}

async function fromCard(
  card: DroppedFile,
  files: readonly DroppedFile[],
  maxBytes: number,
): Promise<ExpressionImport> {
  const assets = emotionAssetsOf(await card.file.text().catch(() => ''));
  if (assets === null) return { entries: [], skipped: [baseName(card.path)] };
  const folder = folderOf(card.path);
  const entries: ImportedExpression[] = [];
  const skipped: string[] = [];
  for (const asset of assets) {
    const image = assetImage(asset.uri, folder, files, maxBytes);
    const label = normalizeExpressionLabel(asset.name);
    if (image === null || label === null) skipped.push(asset.name);
    else entries.push({ label, image });
  }
  return { entries, skipped };
}

function emotionAssetsOf(text: string): { readonly name: string; readonly uri: string }[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const data = isRecord(raw) ? raw.data : undefined;
  if (!isRecord(data)) return null;
  if (!isUnknownArray(data.assets)) return [];
  return data.assets.flatMap((asset) =>
    isRecord(asset) &&
    asset.type === EMOTION_ASSET_TYPE &&
    typeof asset.name === 'string' &&
    typeof asset.uri === 'string'
      ? [{ name: asset.name, uri: asset.uri }]
      : [],
  );
}

function assetImage(
  uri: string,
  folder: string,
  files: readonly DroppedFile[],
  maxBytes: number,
): Blob | null {
  if (uri.startsWith(DATA_PREFIX)) return dataUrlImage(uri, maxBytes);
  if (!uri.startsWith(EMBEDDED_PREFIX)) return null;
  const target = uri.slice(EMBEDDED_PREFIX.length).replace(/^\/+/u, '');
  const found =
    files.find((item) => item.path === `${folder}${target}`) ??
    files.find((item) => baseName(item.path) === baseName(target));
  return found === undefined ? null : asImage(found.file, found.path, maxBytes);
}

function dataUrlImage(uri: string, maxBytes: number): Blob | null {
  const mark = uri.indexOf(BASE64_MARK);
  if (mark < 0) return null;
  const type = uri.slice(DATA_PREFIX.length, mark);
  if (!EXPRESSION_IMAGE_TYPES.includes(type)) return null;
  const bytes = fromBase64(uri.slice(mark + BASE64_MARK.length));
  if (bytes === null || bytes.length > maxBytes) return null;
  return new Blob([bytes], { type });
}

function asImage(file: File, path: string, maxBytes: number): Blob | null {
  if (file.size > maxBytes) return null;
  const extension = baseName(path).split('.').at(-1)?.toLowerCase() ?? '';
  const type = file.type || (TYPE_BY_EXTENSION[extension] ?? '');
  if (!EXPRESSION_IMAGE_TYPES.includes(type)) return null;
  return file.type === type ? file : new Blob([file], { type });
}

function baseName(path: string): string {
  return path.split('/').at(-1) ?? path;
}

function folderOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at + 1);
}
