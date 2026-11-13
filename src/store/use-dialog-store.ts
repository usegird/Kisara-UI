import { create } from 'zustand';

import type { DialogMode } from '@/lib/dialog-rect';

// ─────────────────────────────
// 開いているダイアログの並び（末尾が一番上）と、埋め込みの嵌め先。端末には残さない。
// ─────────────────────────────

/**
 * 並びの 1 つ。閉じるのを確かめる画面（直しかけのスタイル）は閉じ終わるまで下に残るので、
 * 埋め込みで見せるのは一番上の 1 つだけにする
 */
interface OpenDialog {
  readonly id: string;
  readonly mode: DialogMode;
  /**
   * 閉じる手続き。埋め込みで別のものが開いたら呼ぶ。
   * null は埋め込みの入れ替えに加わらない（閉じさせず、ほかも閉じない。確かめるダイアログ）
   */
  readonly close: (() => void) | null;
}

/** ダイアログの並びと嵌め先の状態と操作 */
interface DialogState {
  /**
   * 嵌め先（ノードと変数の列の、見えている範囲を覆う要素。画面の側が 1 つだけ登録する）。
   * 無いとき（ワークフローを開いていない等）は埋め込みでも自由移動で出す
   */
  readonly embedHost: HTMLElement | null;
  readonly order: readonly OpenDialog[];
  readonly setEmbedHost: (host: HTMLElement | null) => void;
  /**
   * 一番上へ（開いたとき・押したとき・出し方を変えたとき）。埋め込みならほかの埋め込みを閉じる。
   * `close` を省くと、並びにある手続きをそのまま使う
   */
  readonly raise: (id: string, mode: DialogMode, close?: (() => void) | null) => void;
  /**
   * 出し方そのままで一番上へ戻す（閉じるのをやめたとき）。埋め込みなら、その間に開いたものを閉じる。
   * 並びに無ければ何もしない
   */
  readonly reclaim: (id: string) => void;
  /** 並びから外す（閉じたとき） */
  readonly remove: (id: string) => void;
}

export const useDialogStore = create<DialogState>()((set, get) => ({
  embedHost: null,
  order: [],
  setEmbedHost: (embedHost) => set({ embedHost }),
  raise: (id, mode, close) => {
    let closing: readonly OpenDialog[] = [];
    set((state) => {
      const known = state.order.find((entry) => entry.id === id);
      const entry: OpenDialog = {
        id,
        mode,
        close: close === undefined ? (known?.close ?? null) : close,
      };
      const others = state.order.filter((item) => item.id !== id);
      if (entry.mode === 'embedded' && entry.close !== null) {
        closing = others.filter((item) => item.mode === 'embedded' && item.close !== null);
      }
      const top = state.order.at(-1);
      const unchanged = top === known && top?.mode === mode && top.close === entry.close;
      if (unchanged && closing.length === 0) return state;
      return { order: [...others, entry] };
    });
    // 並びを書き終えてから閉じる（閉じた側は外れるときに自分で並びから抜ける）
    for (const item of closing) item.close?.();
  },
  reclaim: (id) => {
    const known = get().order.find((entry) => entry.id === id);
    if (known !== undefined) get().raise(id, known.mode);
  },
  remove: (id) =>
    set((state) =>
      state.order.some((entry) => entry.id === id)
        ? { order: state.order.filter((entry) => entry.id !== id) }
        : state,
    ),
}));

/** 埋め込みで見せる 1 つ（並びの中で一番上の埋め込み）。無ければ null */
export function topEmbedded(order: readonly OpenDialog[]): string | null {
  return order.findLast((entry) => entry.mode === 'embedded')?.id ?? null;
}
