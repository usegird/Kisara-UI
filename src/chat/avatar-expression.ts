import { isRecord, isUnknownArray } from '@/lib/guards';
import {
  buildPng,
  createZtxtChunk,
  readPngChunks,
  readZtxtText,
  textKeywordOf,
  type PngChunk,
} from '@/lib/png-chunks';

export const EXPRESSION_MANIFEST_KEYWORD = 'kisara-expressions';
const EXPRESSION_IMAGE_PREFIX = 'kisara-expr:';
const MANIFEST_VERSION = 1;
export const DEFAULT_EXPRESSION_LABEL = 'neutral';
export const PRESET_EXPRESSION_LABELS: readonly string[] = [
  'admiration',
  'amusement',
  'anger',
  'annoyance',
  'approval',
  'caring',
  'confusion',
  'curiosity',
  'desire',
  'disappointment',
  'disapproval',
  'disgust',
  'embarrassment',
  'excitement',
  'fear',
  'gratitude',
  'grief',
  'joy',
  'love',
  'nervousness',
  'neutral',
  'optimism',
  'pride',
  'realization',
  'relief',
  'remorse',
  'sadness',
  'surprise',
];
export const MAX_EXPRESSION_LABEL_LENGTH = 40;
export const EXPRESSION_IMAGE_TYPES: readonly string[] = ['image/png', 'image/webp', 'image/jpeg'];
const BASE64_SLICE = 0x8000;
const ASCII_MAX = 0x7f;
const UNICODE_ESCAPE_DIGITS = 4;
const HEX = 16;

export interface Expression {
  readonly label: string;
  readonly image: Blob;
}

export interface ExpressionSet {
  readonly defaultLabel: string;
  readonly items: readonly Expression[];
}

export type ExpressionRead =
  { readonly kind: 'ok'; readonly set: ExpressionSet } | { readonly kind: 'unreadable' };

interface ManifestItem {
  readonly label: string;
  readonly key: number | null;
  readonly type: string;
}

export function normalizeExpressionLabel(raw: string): string | null {
  const label = raw.trim();
  if (label.length === 0 || label.length > MAX_EXPRESSION_LABEL_LENGTH) return null;
  return label;
}

export function hasExpressions(set: ExpressionSet): boolean {
  return set.items.length > 1;
}

export function expressionImageOf(set: ExpressionSet, label: string | null): Blob | null {
  const found = label === null ? undefined : set.items.find((item) => item.label === label);
  return (found ?? set.items.find((item) => item.label === set.defaultLabel))?.image ?? null;
}

export async function readExpressionSet(image: Blob): Promise<ExpressionRead> {
  const single: ExpressionRead = {
    kind: 'ok',
    set: {
      defaultLabel: DEFAULT_EXPRESSION_LABEL,
      items: [{ label: DEFAULT_EXPRESSION_LABEL, image }],
    },
  };
  const chunks = readPngChunks(await image.arrayBuffer());
  if (chunks === null) return single;
  const manifestChunk = chunks.find(
    (chunk) => textKeywordOf(chunk) === EXPRESSION_MANIFEST_KEYWORD,
  );
  if (manifestChunk === undefined) return single;
  const manifest = parseManifest(await readZtxtText(manifestChunk));
  if (manifest === null) return { kind: 'unreadable' };

  const images = new Map<string, PngChunk>();
  for (const chunk of chunks) {
    const keyword = textKeywordOf(chunk);
    if (keyword?.startsWith(EXPRESSION_IMAGE_PREFIX)) images.set(keyword, chunk);
  }
  const items: Expression[] = [];
  for (const item of manifest.items) {
    if (item.key === null) {
      items.push({ label: item.label, image });
      continue;
    }
    const chunk = images.get(`${EXPRESSION_IMAGE_PREFIX}${String(item.key)}`);
    const text = chunk === undefined ? null : await readZtxtText(chunk);
    const bytes = text === null ? null : fromBase64(text);
    if (bytes !== null)
      items.push({ label: item.label, image: new Blob([bytes], { type: item.type }) });
  }
  return { kind: 'ok', set: { defaultLabel: manifest.defaultLabel, items } };
}

export async function writeExpressionSet(
  original: Blob,
  defaultPng: Blob,
  set: ExpressionSet,
): Promise<Blob> {
  const base = readPngChunks(await defaultPng.arrayBuffer());
  if (base === null) throw new TypeError('default image is not PNG');
  const kept = base.filter((chunk) => !isExpressionChunk(chunk));
  const keywords = new Set(kept.map(textKeywordOf).filter((keyword) => keyword !== null));
  const carried =
    original === defaultPng
      ? []
      : (readPngChunks(await original.arrayBuffer()) ?? []).filter((chunk) => {
          const keyword = textKeywordOf(chunk);
          return keyword !== null && !isExpressionChunk(chunk) && !keywords.has(keyword);
        });
  const added = hasExpressions(set) ? await expressionChunks(set) : [];
  const body = kept.filter((chunk) => chunk.type !== 'IEND');
  const end = kept.filter((chunk) => chunk.type === 'IEND');
  return new Blob([buildPng([...body, ...carried, ...added, ...end])], { type: 'image/png' });
}

export async function hasExpressionManifest(image: Blob): Promise<boolean> {
  const chunks = readPngChunks(await image.arrayBuffer());
  return chunks?.some((chunk) => textKeywordOf(chunk) === EXPRESSION_MANIFEST_KEYWORD) ?? false;
}

export async function stripExpressionChunks(image: Blob): Promise<Blob> {
  const chunks = readPngChunks(await image.arrayBuffer());
  if (chunks === null || !chunks.some(isExpressionChunk)) return image;
  return new Blob([buildPng(chunks.filter((chunk) => !isExpressionChunk(chunk)))], {
    type: 'image/png',
  });
}

function isExpressionChunk(chunk: PngChunk): boolean {
  const keyword = textKeywordOf(chunk);
  return (
    keyword !== null &&
    (keyword === EXPRESSION_MANIFEST_KEYWORD || keyword.startsWith(EXPRESSION_IMAGE_PREFIX))
  );
}

async function expressionChunks(set: ExpressionSet): Promise<PngChunk[]> {
  const chunks: PngChunk[] = [];
  const items: { label: string; key?: number; type: string }[] = [];
  let key = 0;
  for (const item of set.items) {
    if (item.label === set.defaultLabel) {
      items.push({ label: item.label, type: 'image/png' });
      continue;
    }
    const text = toBase64(new Uint8Array(await item.image.arrayBuffer()));
    chunks.push(await createZtxtChunk(`${EXPRESSION_IMAGE_PREFIX}${String(key)}`, text));
    items.push({ label: item.label, key, type: item.image.type });
    key += 1;
  }
  const manifest = { v: MANIFEST_VERSION, default: set.defaultLabel, items };
  return [await createZtxtChunk(EXPRESSION_MANIFEST_KEYWORD, asciiJson(manifest)), ...chunks];
}

function parseManifest(
  text: string | null,
): { readonly defaultLabel: string; readonly items: ManifestItem[] } | null {
  if (text === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.v !== MANIFEST_VERSION || typeof raw.default !== 'string') return null;
  if (!isUnknownArray(raw.items)) return null;
  const seen = new Set<string>();
  const items = raw.items.flatMap((item): ManifestItem[] => {
    const parsed = parseManifestItem(item);
    if (parsed === null || seen.has(parsed.label)) return [];
    seen.add(parsed.label);
    return [parsed];
  });
  const fallback = items.find((item) => item.key === null && item.label === raw.default);
  return fallback === undefined ? null : { defaultLabel: raw.default, items };
}

function parseManifestItem(raw: unknown): ManifestItem | null {
  if (!isRecord(raw) || typeof raw.label !== 'string') return null;
  const label = normalizeExpressionLabel(raw.label);
  if (label === null) return null;
  if (raw.key === undefined) return { label, key: null, type: 'image/png' };
  const { key } = raw;
  if (typeof key !== 'number' || !Number.isInteger(key) || key < 0) return null;
  if (typeof raw.type !== 'string' || !EXPRESSION_IMAGE_TYPES.includes(raw.type)) return null;
  return { label, key, type: raw.type };
}

function asciiJson(value: unknown): string {
  const json = JSON.stringify(value);
  let out = '';
  for (let index = 0; index < json.length; index += 1) {
    const unit = json.charCodeAt(index);
    out +=
      unit <= ASCII_MAX
        ? json.charAt(index)
        : `\\u${unit.toString(HEX).padStart(UNICODE_ESCAPE_DIGITS, '0')}`;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += BASE64_SLICE) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_SLICE));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
