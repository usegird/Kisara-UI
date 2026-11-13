import { cva } from 'class-variance-authority';

import { TAP_TO_EDIT_CLASS } from '@/components/comfy/flow/tap-to-edit';

// ─────────────────────────────
// ワークフロー画面の外枠・横に送る枠・列を並べる段の見た目
// ─────────────────────────────

/**
 * 狭い画面では左右と下の余白を詰める。広い画面は下の余白を空けず、横に送るバーを画面の下端
 * （右の列を下に置いたときは右の列のタブのすぐ上）に出す
 */
export const canvasFrame = cva(
  ['flex h-full flex-col overflow-hidden pt-column-top', TAP_TO_EDIT_CLASS],
  {
    // 狭い画面は右下に拡大・縮小のボタンを重ねる
    variants: {
      narrow: { true: 'relative px-2 pb-2', false: 'pr-1 pl-6' },
    },
  },
);

/**
 * 送る枠。横に並べるときは横だけ送り、アプリ入力の列を左へ寄せたぶん（9px）左へ広げて欠けないようにする。
 * 狭い画面では 1 枚の面として縦にも横にも送る（列の幅の基準にもする）
 */
export const flowScroller = cva('min-h-0 flex-1', {
  variants: {
    narrow: {
      true: 'overflow-auto overscroll-contain [container-type:size]',
      false: '-ml-[9px] w-[calc(100%+9px)] overflow-x-auto overflow-y-hidden pl-[9px]',
    },
  },
});

/** 列を並べる段。狭い画面では列を中身の高さのまま上に揃える */
export const columnRow = cva('relative flex w-max gap-4', {
  variants: {
    narrow: { true: 'min-h-full items-start', false: 'h-full min-w-full items-stretch' },
  },
});
