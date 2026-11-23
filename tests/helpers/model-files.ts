import { modelFileIndex, type ModelFile } from '@/graph/model-files';
import type { ModelFolder } from '@/store/use-model-files-store';

export function modelFile(name: string, overrides: Partial<ModelFile> = {}): ModelFile {
  return { name, pathIndex: 0, modified: null, created: null, size: null, ...overrides };
}

export function modelFolder(files: readonly ModelFile[]): ModelFolder {
  return { status: 'ready', files, index: modelFileIndex(files), error: null };
}
