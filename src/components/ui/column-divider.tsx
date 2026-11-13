import { cva } from 'class-variance-authority';

import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { KEYBOARD_RESIZE_STEP } from '@/lib/resize-step';
import type { ColumnKey } from '@/store/settings-fields/column-widths';

// ─────────────────────────────
// 列の境目。ドラッグとキーボード（`role="separator"`）で列の幅を変える。
// ─────────────────────────────

/** Home・End で動かす量。どの幅より大きく、上下限で止まる */
const RESIZE_TO_END = 9999;

/**
 * 掴める幅の中で線を置く所。`start` は線を左端に置き、掴める所を線の右側だけにする
 * （左隣の列のスクロールバーに掴める所を被せないため）
 */
const divider = cva(
  `group/divider relative z-10 -mx-1 flex w-3 shrink-0 cursor-col-resize items-stretch
    self-stretch focus:outline-none`,
  { variants: { line: { center: 'justify-center', start: 'justify-start' } } },
);

/** `K` は列の名前。既定はワークフローの列（会話の左の列は自分の名前を渡す） */
export interface ColumnDividerProps<K extends string = ColumnKey> {
  /** 動かす対象の列 */
  readonly column: K;
  /** 読み上げに出す列の名前 */
  readonly label: string;
  /** 列の今の幅（px）。読み上げの値に出す */
  readonly width: number;
  /** 対象の列が仕切りのどちら側にあるか。右側なら動かす向きが逆になる */
  readonly side?: 'left' | 'right' | undefined;
  /** 見た目と掴める位置を横へずらす量（px）。並びは動かさない */
  readonly offset?: number | undefined;
  /** 掴める幅の中の線の位置。既定は真ん中 */
  readonly line?: 'center' | 'start' | undefined;
  /** 幅を `delta` だけ変える。範囲に収めるのは受け取る側 */
  readonly onResize: (column: K, delta: number) => void;
}

/** 列の境目。指したときか焦点が当たったときだけ細い破線を出す */
export function ColumnDivider<K extends string = ColumnKey>({
  column,
  label,
  width,
  side = 'left',
  offset = 0,
  line = 'center',
  onResize,
}: ColumnDividerProps<K>): React.ReactElement {
  // 右側の列は、仕切りを右へ動かすと狭くなる
  const resize = (delta: number): void => onResize(column, side === 'right' ? -delta : delta);

  // 幅は列の設定が持つので、ここでは**掴んでから渡し終えた量**だけ覚え、差を渡す
  const drag = useDragFrom(
    () => ({ applied: 0 }),
    (from: { applied: number }, dx: number) => {
      resize(dx - from.applied);
      from.applied = dx;
    },
  );

  return (
    <div
      role="separator"
      // どの境目か（ホイールの送り先を決める。use-flow-scrolling）
      data-column-divider={column}
      aria-orientation="vertical"
      aria-label={t('flow.resize.columnWidth', { name: label })}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      // 接続線のヒットエリア（透明で太い）より前に出す。でないと掴めない
      // 親が items-start なので、**self-stretch を付けないと高さ 0 になって掴めない**
      className={divider({ line })}
      // 並びを崩さずに見た目だけ動かす（余白を変えると隣の列の幅が変わる）
      style={offset === 0 ? undefined : { transform: `translateX(${String(offset)}px)` }}
      {...drag}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') resize(-KEYBOARD_RESIZE_STEP);
        else if (event.key === 'ArrowRight') resize(KEYBOARD_RESIZE_STEP);
        else if (event.key === 'Home') resize(-RESIZE_TO_END);
        else if (event.key === 'End') resize(RESIZE_TO_END);
        else return;

        event.preventDefault();
      }}
    >
      <span
        aria-hidden
        className="border-muted-foreground/60 group-focus/divider:border-ring group-hover/divider:border-l
          group-focus/divider:border-l h-full border-l-0 border-dashed"
      />
    </div>
  );
}
