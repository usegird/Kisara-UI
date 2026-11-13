import { create } from 'zustand';

import type { HistoryEntry } from '@/port/history';
import { formatHistoryFailure } from '@/queue/comfy-failure-text';
import {
  mergeTaskEntries,
  type RejectedRun,
  type SubmittedRun,
  type TaskLogEntry,
} from '@/queue/task-log';
import { registerHolder, trimHeld } from '@/store/kit/memory-budget';

// ─────────────────────────────
// 実行したタスクの控え（この画面が開いている間だけ。保存はせず、ComfyUI 本家のフィードと同じ扱い）。
// ComfyUI の履歴はメモリ上にあり再起動で消えるので、その画面で見えていたタスクを辿れるように覚えておく。
// ─────────────────────────────

/** 断られたタスクの id。**サーバーの prompt_id とぶつからない**形にする */
const REJECTED_ID_PREFIX = 'rejected:';

let rejectedCount = 0;

/**
 * タスクの控えと、覚える操作。生成情報は応答をそのまま（`/history` の 1 件分）持ち、画像は参照だけを持つ
 */
interface TaskLogState {
  readonly entries: readonly TaskLogEntry[];
  /**
   * 履歴で見えたものを控える。`raw` は prompt id → 応答の1件分。
   * 既にあるものは新しい内容で置き換える（名前と、取れなかった応答は保つ）。
   */
  readonly record: (
    entries: readonly HistoryEntry[],
    raw?: Readonly<Record<string, unknown>>,
  ) => void;
  /** 受理された実行の名前・表記・注意を覚える（投げた時点では結果がまだ無い） */
  readonly recordSubmitted: (promptId: string, run: SubmittedRun) => void;
  /** 応答を控える（画像の埋め込みから読んだ場合など、履歴以外から得たとき） */
  readonly setDetail: (promptId: string, raw: unknown) => void;
  /** 断られた実行を 1 件控える（**上書きしない**）。控えた id を返す */
  readonly recordRejected: (run: RejectedRun) => string;
  readonly clear: () => void;
}

export const useTaskLogStore = create<TaskLogState>()((set) => ({
  entries: [],

  record: (entries, raw = {}) =>
    set((state) => ({
      entries: mergeTaskEntries(
        state.entries,
        entries.map((entry) => ({
          promptId: entry.promptId,
          number: entry.number,
          startedAt: entry.startedAt,
          finishedAt: entry.finishedAt,
          success: entry.success,
          outputs: entry.outputs,
          error: formatHistoryFailure(entry.error),
          name: null,
          raw: raw[entry.promptId],
        })),
      ),
    })),

  setDetail: (promptId, raw) =>
    set((state) => {
      const previous = state.entries.find((entry) => entry.promptId === promptId);
      if (!previous) return state;

      return { entries: mergeTaskEntries(state.entries, [{ ...previous, raw }]) };
    }),

  recordRejected: ({ name, labels, notes, failure, prompt, at }) => {
    rejectedCount += 1;
    const promptId = `${REJECTED_ID_PREFIX}${String(at)}:${String(rejectedCount)}`;
    set((state) => ({
      entries: mergeTaskEntries(state.entries, [
        {
          promptId,
          number: null,
          startedAt: at,
          finishedAt: at,
          success: false,
          outputs: [],
          name,
          // 履歴と同じ形（`prompt[2]` に API Prompt）にして、詳細の読み方をそろえる
          raw: prompt === null ? undefined : { prompt: [null, promptId, prompt, {}, []] },
          rejection: failure,
          labels,
          notes,
        },
      ]),
    }));
    return promptId;
  },

  recordSubmitted: (promptId, { name, labels, notes }) =>
    set((state) => ({
      entries: mergeTaskEntries(state.entries, [
        {
          promptId,
          number: null,
          startedAt: Date.now(),
          finishedAt: null,
          success: null,
          outputs: [],
          name,
          labels,
          notes,
        },
      ]),
    })),

  clear: () => set({ entries: [] }),
}));

const rawBytes = new WeakMap<object, number>();

/** 応答の 1 件分の大きさの目安（文字数。量るのは 1 件 1 回） */
function bytesOf(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return 0;
  const known = rawBytes.get(raw);
  if (known !== undefined) return known;
  let bytes = 0;
  try {
    bytes = JSON.stringify(raw).length;
  } catch {
    // 量れない物（循環など）は数えない
  }
  rawBytes.set(raw, bytes);
  return bytes;
}

// 結果の画像と合わせた上限で、古い方から `/history` の丸ごとを手放す（`memory-budget`）。
// 一覧に出す軽い部分は残す。詳細を開けば取り直す。断られた実行は ComfyUI に無いので手放さない
registerHolder('task-log', {
  held: () =>
    useTaskLogStore.getState().entries.flatMap((entry) =>
      entry.raw === undefined || entry.rejection !== undefined
        ? []
        : [
            {
              key: entry.promptId,
              bytes: bytesOf(entry.raw),
              order: entry.startedAt ?? entry.finishedAt ?? 0,
            },
          ],
    ),
  release: (keys) =>
    useTaskLogStore.setState((state) => ({
      entries: state.entries.map((entry) =>
        keys.has(entry.promptId) ? { ...entry, raw: undefined } : entry,
      ),
    })),
});

// 足したら上限を見る（足す操作のあとにまとめて）
useTaskLogStore.subscribe((state, previous) => {
  if (state.entries !== previous.entries) trimHeld();
});
