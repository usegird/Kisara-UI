import { styleKey } from '@/graph/styles';
import { escapeFileName, unescapeFileName } from '@/lib/file-name';

export const KISARA_NOTES_DIR = 'kisara/notes';

export const KISARA_STYLES_DIR = 'kisara/styles';

export const KISARA_TAGS_DIR = 'kisara/tags';

export const PYSSSSS_OVERRIDE_FILE = 'override/pysssss.csv';

const NOTES_EXTENSION = '.txt';

const JSON_EDITS_EXTENSION = '.json';

const TAG_DICTIONARY_EXTENSION = '.csv';

export function notesFilePath(folder: string, filename: string): string {
  return `${modelFileStem(folder, filename)}${NOTES_EXTENSION}`;
}

export function jsonEditsFilePath(folder: string, filename: string): string {
  return `${modelFileStem(folder, filename)}${JSON_EDITS_EXTENSION}`;
}

function modelFileStem(folder: string, filename: string): string {
  return [folder, ...filename.split(/[\\/]/)]
    .filter((segment) => segment.length > 0)
    .map(escapeFileName)
    .join('/');
}

export function styleFilePath(name: string): string {
  return `${escapeFileName(styleKey(name))}.json`;
}

export function tagDictionaryPath(name: string): string {
  return `${escapeFileName(name.trim())}${TAG_DICTIONARY_EXTENSION}`;
}

export function tagDictionaryNameOf(path: string): string | null {
  if (path.includes('/') || !path.toLowerCase().endsWith(TAG_DICTIONARY_EXTENSION)) return null;
  const name = unescapeFileName(path.slice(0, -TAG_DICTIONARY_EXTENSION.length));
  return name.length > 0 ? name : null;
}
