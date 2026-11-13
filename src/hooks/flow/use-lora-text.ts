import { useCallback, useRef } from 'react';

import { formatLoraCopy, usesFetchedParts, usesLearnText, usesMemo } from '@/graph/model-files';
import { summarizeModelMetadata } from '@/graph/model-metadata';
import { t } from '@/i18n';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { useModelNotesStore } from '@/store/use-model-notes-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// Lora の文字を、設定の写し取りの書式で作る（一覧の写し取り・差し込み・掴んで落とす）。
// ─────────────────────────────

/** 書式に当てはめた文字か、取れなかった理由 */
type LoraTextResult = { readonly text: string } | { readonly error: string };

/** 書式に当てはめた文字。取れなければ理由 */
type LoraText = (folder: string, value: string) => Promise<LoraTextResult>;

/** 書式に当てはめた Lora の文字を作る手続きを返す。書式が使うときだけ metadata とメモを取りに行く */
export function useLoraText(): LoraText {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const format = useSettingsStore((state) => state.loraCopyFormat);

  // 同じ物であることを、取っておいた文字の作り直しの判定に使う（`useLoraDragText`）。
  // compiler はこのフックを飛ばす（try の中の条件式や ?. を扱えない）ので、手で固定する
  return useCallback(
    async (folder, value) => {
      let learned: readonly string[] = [];
      if (usesLearnText(format)) {
        try {
          const metadata = await comfyPort().models.fetchMetadata(baseUrl, folder, value);
          learned = summarizeModelMetadata(metadata).triggers;
        } catch (cause) {
          const message = formatComfyFailure(cause);
          return { error: t('insertBar.lora.triggersFailed', { message }) };
        }
      }
      let memo = '';
      if (usesMemo(format)) {
        try {
          memo = (await readMemo(baseUrl, folder, value)) ?? '';
        } catch (cause) {
          const message = formatComfyFailure(cause);
          return { error: t('insertBar.lora.memoFailed', { message }) };
        }
      }
      return { text: formatLoraCopy(format, value, learned, memo) };
    },
    [baseUrl, format],
  );
}

/** メモ。どちらにも無ければ null。置き場を確かめられなければ読みに行かずに null */
async function readMemo(baseUrl: string, folder: string, value: string): Promise<string | null> {
  await useModelNotesStore.getState().ensure(baseUrl);
  const notes = useModelNotesStore.getState();
  if (notes.status !== 'ready') return null;
  return notes.read(baseUrl, folder, value);
}

/**
 * 掴んで落とす文字。**文字は落とされた時に作る**（`resolve`）。学習で多かった語を取りに行く
 * 書式でも、掴むのを待たせない（画像の読み込みで接続が埋まっている間は取得が遅れる）。
 * 押した時点で取りに行き始め（`prepare`）、間に合っていれば掴んだ時点の文字（`peek`）も渡す
 * （ほかのアプリ・ほかの欄へ落とすとき用）
 */
export interface LoraDragText {
  readonly prepare: (value: string) => void;
  /** 作り終えていれば文字か理由。まだなら null */
  readonly peek: (value: string) => LoraTextResult | null;
  readonly resolve: (value: string) => Promise<LoraTextResult>;
}

interface LoraTextCache {
  readonly source: LoraText;
  readonly pending: Map<string, Promise<LoraTextResult>>;
  readonly done: Map<string, LoraTextResult>;
}

/** 掴んで落とす Lora の文字を、押した時点から作り始めて値ごとに取っておく */
export function useLoraDragText(folder: string): LoraDragText {
  const format = useSettingsStore((state) => state.loraCopyFormat);
  const loraText = useLoraText();
  // 書式か接続先が変わったら作り直す（古い書式の文字を落とさない）
  const cache = useRef<LoraTextCache | null>(null);

  const current = (): LoraTextCache => {
    if (cache.current?.source !== loraText) {
      cache.current = { source: loraText, pending: new Map(), done: new Map() };
    }
    return cache.current;
  };

  const resolve = (value: string): Promise<LoraTextResult> => {
    // 接続先から取るものを使わない書式は、その場で作れる
    if (!usesFetchedParts(format)) {
      return Promise.resolve({ text: formatLoraCopy(format, value, []) });
    }
    const entry = current();
    const started = entry.pending.get(value);
    if (started !== undefined) return started;
    const next = loraText(folder, value).then((result) => {
      entry.done.set(value, result);
      return result;
    });
    entry.pending.set(value, next);
    return next;
  };

  const prepare = (value: string): void => void resolve(value);

  const peek = (value: string): LoraTextResult | null => {
    if (!usesFetchedParts(format)) return { text: formatLoraCopy(format, value, []) };
    return current().done.get(value) ?? null;
  };

  return { prepare, peek, resolve };
}
