import { cva } from 'class-variance-authority';

import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';

// ─────────────────────────────
// ストレージの管理の見た目のうち、帯・一覧・概要の部品が共に使うもの。
// ─────────────────────────────

/**
 * 右の列の下限。横に送らずに並べきれる、いちばん広い中身（バックアップの列のある種類を英語で出したとき
 * 373px）に、縦に送る線の幅を足した値
 */
export const RIGHT_MIN = 386;

/** 文字のボタン（読み込み直す・エクスポート・全て削除） */
export const BUTTON =
  'hover:bg-muted shrink-0 rounded-md border px-2 py-0.5 text-xs disabled:opacity-40';

/** アイコンのボタンが無い行で、列を揃えるための空き（アイコンのボタンと同じ幅） */
export const ICON_SPACER = 'w-[22px] shrink-0';

/** 削除の印を付けた欄は取り消し線を引いて薄くする */
export const MARKED = { true: 'line-through opacity-50', false: '' };

/** 削除アイコン。印を付けているときは入っている見た目にする */
export const deleteIcon = cva(`${DIALOG_ICON_CLASS} shrink-0`, {
  variants: { marked: { true: 'bg-muted text-destructive', false: '' } },
});

/**
 * 1 行。localStorage などの表と同じく横罫線だけで、左右の余白を付けない（1 件の行は、文字の 1 行の高さを
 * アイコンと同じ 22px にし、回り込んでも行の高さが揃うようにする）
 */
export const ROW_GRID = 'col-span-full grid grid-cols-subgrid items-center';

/**
 * バックアップの欄。時刻と、大きさ・アイコンの組を 1 行に並べ、足りなければ組が時刻の下へ回る。
 * 左の境目の線は、バックアップの無い行・見出しでも同じ位置に引く
 */
export const BACKUP_CELL =
  'col-start-2 ml-2 flex flex-wrap content-center items-center gap-x-2 self-stretch border-l pl-2';
