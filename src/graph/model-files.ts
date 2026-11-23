import { hasModelJsonValue } from '@/graph/model-metadata';
import type { NodeDefinition } from '@/graph/types';
import { toSlashPath, withoutExtension } from '@/lib/file-name';
import { isRecord } from '@/lib/guards';
import { directoryTree, type PathDirectory } from '@/lib/path-tree';
import { matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';

export interface ModelFile {
  readonly name: string;
  readonly pathIndex: number;
  readonly modified: number | null;
  readonly created: number | null;
  readonly size: number | null;
}

export interface ModelItem {
  readonly value: string;
  readonly path: string;
  readonly directory: string;
  readonly label: string;
  readonly file: ModelFile | null;
}

type ModelDirectory = PathDirectory;

export type ModelSortKey = 'name' | 'modified' | 'created' | 'size';

const MODEL_SORT_KEYS: readonly ModelSortKey[] = ['name', 'modified', 'created', 'size'];

export interface ModelSort {
  readonly key: ModelSortKey;
  readonly ascending: boolean;
}

export const DEFAULT_MODEL_SORT: ModelSort = { key: 'name', ascending: true };

export function normalizeModelSort(value: unknown): ModelSort {
  if (!isRecord(value)) return DEFAULT_MODEL_SORT;

  const known = MODEL_SORT_KEYS.find((candidate) => candidate === value.key);
  return {
    key: known ?? DEFAULT_MODEL_SORT.key,
    ascending:
      typeof value.ascending === 'boolean' ? value.ascending : DEFAULT_MODEL_SORT.ascending,
  };
}

export function normalizeModelName(name: string): string {
  return toSlashPath(name).replace(/^\.\//, '').replace(/\/+/g, '/').replace(/^\/+/, '');
}

function hasExtension(value: string): boolean {
  const base = normalizeModelName(value).split('/').pop() ?? '';
  return /\.[^.]+$/.test(base);
}

function baseLabel(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.[^.]+$/, '');
}

export function modelNameOf(value: string): string {
  return withoutExtension(normalizeModelName(value));
}

export function modelTypeOf(item: ModelItem): string {
  return item.path.slice(withoutExtension(item.path).length);
}

function directoryOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

export function modelFileIndex(files: readonly ModelFile[]): ReadonlyMap<string, ModelFile> {
  const index = new Map<string, ModelFile>();

  for (const file of files) {
    const key = normalizeModelName(file.name);
    if (!index.has(key)) index.set(key, file);
  }
  return index;
}

export function isModelFolderOptions(
  options: readonly unknown[] | null,
  index: ReadonlyMap<string, ModelFile>,
): boolean {
  if (options === null || index.size === 0) return false;

  let candidates = 0;
  for (const option of options) {
    if (typeof option !== 'string' || !hasExtension(option)) continue;

    candidates += 1;
    if (!index.has(normalizeModelName(option))) return false;
  }
  return candidates > 0;
}

export function buildModelItems(
  options: readonly unknown[],
  index: ReadonlyMap<string, ModelFile>,
): ModelItem[] {
  const items: ModelItem[] = [];

  for (const option of options) {
    if (typeof option !== 'string' || option.length === 0) continue;

    const path = normalizeModelName(option);
    items.push({
      value: option,
      path,
      directory: directoryOf(path),
      label: baseLabel(path),
      file: index.get(path) ?? null,
    });
  }
  return items;
}

export function modelDirectories(items: readonly ModelItem[]): ModelDirectory[] {
  return directoryTree(items.map((item) => item.directory));
}

interface ModelFilter {
  readonly directory: string;
  readonly query: string;
}

export function filterModelItems(
  items: readonly ModelItem[],
  filter: ModelFilter,
): readonly ModelItem[] {
  const terms = searchTerms(filter.query);
  const prefix = filter.directory.length === 0 ? null : `${filter.directory}/`;

  return items.filter((item) => {
    if (prefix !== null && !item.path.startsWith(prefix)) return false;
    return matchesAnyTerm(item.path, terms);
  });
}

export function rankModelItems(items: readonly ModelItem[], query: string): ModelItem[] {
  return rankBySearch(items, query, (item) => ({
    names: [item.label, item.path],
    texts: [item.path],
  }));
}

function sortValue(item: ModelItem, key: ModelSortKey): number | null {
  if (key === 'modified') return item.file?.modified ?? null;
  if (key === 'created') return item.file?.created ?? null;
  return item.file?.size ?? null;
}

export function sortModelItems(
  items: readonly ModelItem[],
  key: ModelSortKey,
  ascending: boolean,
): readonly ModelItem[] {
  const byName = (left: ModelItem, right: ModelItem): number => left.path.localeCompare(right.path);
  const direction = ascending ? 1 : -1;

  return [...items].sort((left, right) => {
    if (key === 'name') return byName(left, right) * direction;

    const leftValue = sortValue(left, key);
    const rightValue = sortValue(right, key);
    if (leftValue === null || rightValue === null) return byName(left, right);

    return leftValue === rightValue ? byName(left, right) : (leftValue - rightValue) * direction;
  });
}

export function modelInputNames(
  definition: NodeDefinition,
  indexes: ReadonlyMap<string, ReadonlyMap<string, ModelFile>>,
): Set<string> {
  return new Set(
    definition.inputs
      .filter(
        (input) => input.type === 'COMBO' && matchModelFolder(input.options, indexes) !== null,
      )
      .map((input) => input.name),
  );
}

export function matchModelFolder(
  options: readonly unknown[] | null,
  indexes: ReadonlyMap<string, ReadonlyMap<string, ModelFile>>,
): string | null {
  for (const [folder, index] of indexes) {
    if (isModelFolderOptions(options, index)) return folder;
  }
  return null;
}

export const DEFAULT_LORA_COPY_FORMAT =
  '<lora:[name]:[preferred weight|1]> [activation text|ss_tag_frequency]\\n';

const NAME = 'name';
const TAG_FREQUENCY = 'ss_tag_frequency';
const TXT = 'txt';
const TOKEN = /\[([^[\]]+)\]/gu;
const FALLBACK = '|';
const NEWLINE_ESCAPE = /\\n/gu;

export interface LoraCopyParts {
  readonly learned?: readonly string[];
  readonly memo?: string;
  readonly json?: ReadonlyMap<string, string>;
}

function normalizeLoraCopyFormat(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : DEFAULT_LORA_COPY_FORMAT;
}

export function usesLearnText(format: string): boolean {
  return namesOf(format).includes(TAG_FREQUENCY);
}

export function usesMemo(format: string): boolean {
  return namesOf(format).includes(TXT);
}

export function usesJsonKeys(format: string): boolean {
  return namesOf(format).some((name) => !isReservedToken(name));
}

export function usesFetchedParts(format: string): boolean {
  return namesOf(format).some((name) => name !== NAME);
}

export function formatLoraCopy(format: string, value: string, parts: LoraCopyParts = {}): string {
  let emptied = false;
  const text = normalizeLoraCopyFormat(format).replace(TOKEN, (match, token: string) => {
    const replaced = tokenText(token, value, parts);
    if (replaced === null) return match;
    if (replaced.length === 0) emptied = true;
    return replaced;
  });
  const squeezed = emptied ? squeezeEmptied(text) : text;
  return squeezed.replace(NEWLINE_ESCAPE, '\n');
}

function squeezeEmptied(text: string): string {
  return text
    .replace(/ {2,}/gu, ' ')
    .replace(/ *(\\n) */gu, '$1')
    .trim();
}

function tokenText(token: string, value: string, parts: LoraCopyParts): string | null {
  const names = token.split(FALLBACK);
  const last = names.length - 1;
  let known = false;
  for (const [index, name] of names.entries()) {
    const text = nameText(name, value, parts);
    if (text === null && index === last && last > 0) return name;
    if (text === null) continue;
    known = true;
    if (text.length > 0) return text;
  }
  return known ? '' : null;
}

function nameText(name: string, value: string, parts: LoraCopyParts): string | null {
  if (name === NAME) return modelNameOf(value);
  if (name === TAG_FREQUENCY) return (parts.learned ?? []).join(', ');
  if (name === TXT) return (parts.memo ?? '').trim();
  const json = parts.json?.get(name);
  if (json === undefined) return null;
  return hasModelJsonValue({ key: name, value: json }) ? json.trim() : '';
}

function namesOf(format: string): string[] {
  return [...normalizeLoraCopyFormat(format).matchAll(TOKEN)].flatMap((match) =>
    (match[1] ?? '').split(FALLBACK),
  );
}

function isReservedToken(token: string): boolean {
  return token === NAME || token === TAG_FREQUENCY || token === TXT;
}

export const LORA_FOLDER = 'loras';
export const CHECKPOINT_FOLDER = 'checkpoints';

export const DIFFUSION_MODEL_FOLDER = 'diffusion_models';

export const MODEL_FOLDERS: readonly string[] = [LORA_FOLDER, CHECKPOINT_FOLDER];
