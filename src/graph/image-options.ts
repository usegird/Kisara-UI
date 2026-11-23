import { toSlashPath } from '@/lib/file-name';
import { matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';

export function isImageUpload(config: Readonly<Record<string, unknown>>): boolean {
  const value = config.image_upload;
  return value !== undefined && value !== null && value !== false;
}

export interface ImageItem {
  readonly value: string;
  readonly path: string;
  readonly label: string;
}

export function buildImageItems(options: readonly unknown[]): ImageItem[] {
  const items: ImageItem[] = [];

  for (const option of options) {
    if (typeof option !== 'string' || option.length === 0) continue;

    const path = toSlashPath(option);
    items.push({ value: option, path, label: path.split('/').pop() ?? path });
  }
  return items;
}

export function sortImageItems(items: readonly ImageItem[], ascending: boolean): ImageItem[] {
  const direction = ascending ? 1 : -1;
  return [...items].sort((left, right) => left.path.localeCompare(right.path) * direction);
}

export function filterImageItems(items: readonly ImageItem[], query: string): ImageItem[] {
  const terms = searchTerms(query);
  const matched = items.filter((item) => matchesAnyTerm(item.path, terms));
  return rankBySearch(matched, query, (item) => ({
    names: [item.label, item.path],
    texts: [item.path],
  }));
}

interface ImageFile {
  readonly filename: string;
  readonly subfolder: string;
  readonly type: string;
}

export function imageFileValue(file: ImageFile): string {
  const name = file.subfolder.length === 0 ? file.filename : `${file.subfolder}/${file.filename}`;
  return file.type === 'input' ? name : `${name} [${file.type}]`;
}
