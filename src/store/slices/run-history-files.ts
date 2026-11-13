import type { StateCreator } from 'zustand';

import type { RunHistoryFile } from '@/port/run-history';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { runHistoryLoading } from '@/store/slices/run-history-kit';
import type { RunHistoryState } from '@/store/use-run-history-store';

// ─────────────────────────────
// 実行の記録のストアの、記録のファイルの一覧と中身を読む・空にする操作。
// ─────────────────────────────

/** 区切って並べる読めなかった理由の区切り */
const FAILURE_SEPARATOR = ' / ';

/** この slice が持つ操作 */
type RunHistoryFileActions = Pick<RunHistoryState, 'load' | 'fetchFiles' | 'clear'>;

/** 読んだ中身と、通信で読めなかったファイル */
interface ReadFiles {
  readonly read: Map<string, RunHistoryFile>;
  readonly failures: readonly string[];
}

/** 記録のファイルの一覧と中身を読む操作を作る */
export const createRunHistoryFileSlice: StateCreator<
  RunHistoryState,
  [],
  [],
  RunHistoryFileActions
> = (set, get) => ({
  load: async (baseUrl) => {
    const generation = ++runHistoryLoading.generation;
    runHistoryLoading.requested.clear();
    if (baseUrl.length === 0) {
      set({ entries: [], files: new Map(), status: 'idle', error: null });
      return;
    }
    set({ status: 'loading', error: null });

    try {
      const entries = await comfyPort().runHistory.list(baseUrl);
      if (generation !== runHistoryLoading.generation) return;
      // 中身は捨てる。出しているカードの分は、並びが読み直すときに読み直す
      set({ entries, files: new Map(), status: 'ready', error: null });
    } catch (error) {
      if (generation !== runHistoryLoading.generation) return;
      set({ status: 'error', error: formatComfyFailure(error) });
    }
  },

  fetchFiles: async (baseUrl, names) => {
    const { requested } = runHistoryLoading;
    const generation = runHistoryLoading.generation;
    const loaded = get().files;
    const wanted = names.filter((name) => !requested.has(name) && !loaded.has(name));
    if (baseUrl.length === 0 || wanted.length === 0) return;
    for (const name of wanted) requested.add(name);

    const { read, failures } = await readFiles(baseUrl, wanted);
    // 読んでいる間に読み直した（接続先が変わった）なら捨てる
    if (generation !== runHistoryLoading.generation) return;
    set((state) => ({
      files: read.size === 0 ? state.files : new Map([...state.files, ...read]),
      error: failures.length > 0 ? failures.join(FAILURE_SEPARATOR) : state.error,
    }));
  },

  clear: () => {
    runHistoryLoading.generation++;
    runHistoryLoading.owned.clear();
    runHistoryLoading.sent.clear();
    runHistoryLoading.requested.clear();
    set({
      entries: [],
      files: new Map(),
      status: 'idle',
      error: null,
      upTo: null,
      sessionName: '',
    });
  },
});

/**
 * ファイルの中身を読む。1 ファイルずつ閉じ込め、通信で読めないものだけを外して知らせ、読めた分は返す。
 * 通信で読めなかったものは、次に出すときにもう一度読む
 */
async function readFiles(baseUrl: string, wanted: readonly string[]): Promise<ReadFiles> {
  const read = new Map<string, RunHistoryFile>();
  const failures: string[] = [];
  await Promise.all(
    wanted.map(async (name) => {
      try {
        const result = await comfyPort().runHistory.fetch(baseUrl, name);
        // 形の違うファイル（古い形式の版を含む）は知らせずに外す
        if (result.kind === 'file') read.set(name, result.file);
      } catch (error) {
        runHistoryLoading.requested.delete(name);
        failures.push(`${name}: ${formatComfyFailure(error)}`);
      }
    }),
  );
  return { read, failures };
}
