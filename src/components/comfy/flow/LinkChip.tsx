import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';

import { CHIP_MOTION, type MotionKind } from '@/components/comfy/flow/item-motion';
import { valueTooltip } from '@/components/comfy/flow/value-tooltip';
import { ValueText } from '@/components/comfy/flow/ValueText';
import type { NodeRow as NodeRowData, RowSource } from '@/graph/rows';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { slotColor } from '@/styles/slot-color';

// ─────────────────────────────
// 行の接続のチップ（× で外す）と、付いたときの動き
// ─────────────────────────────

/** 接続済みの行のチップと解除ボタンの並び。現れるとき・外すときに右から動かす */
const chipItem = cva('flex max-w-full items-center gap-1', {
  variants: {
    motion: CHIP_MOTION,
  },
});

/** 接続済みの行の、変数名のチップ */
const linkChip = cva(
  [
    'group/chip bg-muted inline-flex min-w-0 items-center gap-1.5 truncate rounded-full',
    'px-2.5 py-0.5 text-xs',
  ],
  {
    variants: {
      // 生成元がミュート＝この入力には何も来ない。薄くせず取り消し線で見せる（WCAG 1.4.3）
      muted: { true: 'line-through', false: '' },
    },
  },
);

interface LinkChipProps {
  readonly row: NodeRowData;
  readonly source: RowSource;
  readonly motion: MotionKind;
  /** 動きが終わった（`animationend`） */
  readonly onMotionEnd: () => void;
  /** 解除のボタン。無ければボタンを出さない */
  readonly onDisconnect: (() => void) | undefined;
}

/** 接続済みの行の、変数名のチップと解除ボタン */
export function LinkChip({
  row,
  source,
  motion,
  onMotionEnd,
  onDisconnect,
}: LinkChipProps): React.ReactElement {
  return (
    <span
      className={chipItem({ motion })}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onMotionEnd();
      }}
    >
      <span
        className={linkChip({ muted: source.muted })}
        style={{ boxShadow: `inset 0 0 0 1px ${slotColor(row.type)}` }}
        // ホバー説明は変数ボックスと同じ書式（通し番号 → 生成元 / 出力名 → 値1行ずつ）
        title={valueTooltip(source.sourceIndex, source.label, source.values, source.muted)}
      >
        {/* 先頭に生成元のカードの通し番号。続けて値。生成元の名前はホバーで出す */}
        {source.sourceIndex === null ? null : (
          <span className="text-muted-foreground shrink-0 font-semibold tabular-nums">
            {source.sourceIndex}
          </span>
        )}
        {source.values.length > 0 ? (
          <ValueText values={source.values} className="min-w-0 truncate" />
        ) : (
          <span className="truncate">{source.label}</span>
        )}
        {/* 解除ボタンはチップの右端。チップを指したとき（キーで焦点が来たとき）だけ
            幅を取って出す */}
        {onDisconnect ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive -ml-1.5 max-w-0 shrink-0
              overflow-hidden rounded-full opacity-0 group-focus-within/chip:ml-0
              group-focus-within/chip:max-w-3 group-focus-within/chip:opacity-100
              group-hover/chip:ml-0 group-hover/chip:max-w-3 group-hover/chip:opacity-100"
            {...MENU_ACTION}
            aria-label={t('flow.row.disconnectLabel', { name: row.label })}
            title={t('flow.row.disconnect')}
            onClick={onDisconnect}
          >
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </span>
    </span>
  );
}
