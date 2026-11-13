import { modelFileIndex, type ModelFile } from '@/graph/model-files';
import type { ModelFolder } from '@/store/use-model-files-store';

// ─────────────────────────────
// モデルファイル一覧の組み立て。`ModelFile` の項目が増えたら**ここだけ**直す。
// ─────────────────────────────

export function modelFile(name: string, overrides: Partial<ModelFile> = {}): ModelFile {
  return { name, pathIndex: 0, modified: null, created: null, size: null, ...overrides };
}

/** 取得済みの種別1つぶん。ストアへ差し込む形で返す */
export function modelFolder(files: readonly ModelFile[]): ModelFolder {
  return { status: 'ready', files, index: modelFileIndex(files), error: null };
}
