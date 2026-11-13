import { Slider } from '@base-ui/react/slider';
import { useState } from 'react';

import { PERCENT } from '@/components/ui/units';
import { t } from '@/i18n';

// ─────────────────────────────
// 履歴のさかのぼる範囲。横のスライドバーで、どの記録のファイルまで見るかを選ぶ。
// ─────────────────────────────

/** さかのぼる範囲のスライドバーの受け取り物 */
export interface HistoryRangeSliderProps {
  /** 記録のファイル名。時期の古い順 */
  readonly names: readonly string[];
  /** それぞれの時期の表記（`names` と同じ並び） */
  readonly labels: readonly string[];
  /** 選んでいるファイル。null なら全部（一番新しいファイル） */
  readonly upTo: string | null;
  readonly onChange: (upTo: string | null) => void;
}

/**
 * 記録のファイルを選ぶスライドバー。範囲を変えるのはつまみを離したときだけ。
 * キーボードの操作は基盤（Base UI の Slider）に任せる
 */
export function HistoryRangeSlider({
  names,
  labels,
  upTo,
  onChange,
}: HistoryRangeSliderProps): React.ReactElement {
  const last = names.length - 1;
  // スライドバーは左が最小なので、位置は新しい方から数える（0 が一番新しい＝全部）
  const chosen = upTo === null ? 0 : last - Math.max(0, names.indexOf(upTo));
  // 動かしている間の位置（離すまで範囲は変えない）。動かしていなければ null
  const [dragging, setDragging] = useState<number | null>(null);
  const position = dragging ?? chosen;
  // 読み上げは「〜以前」まで言い、ポップアウトは「すべて」か日付だけを出す
  const rangeText = (value: number): string => {
    const label = labels[last - value];
    return value <= 0 || label === undefined
      ? t('history.panel.rangeAll')
      : t('history.panel.rangeUpTo', { date: label });
  };
  // ポップアウトをつまみの位置に合わせて寄せる（左端では右へ、右端では左へ伸ばし、欠けないように）
  const shift = last <= 0 ? 0 : (position / last) * PERCENT;
  const popoutText = (value: number): string => {
    const label = labels[last - value];
    return value <= 0 || label === undefined ? t('history.panel.rangeAll') : label;
  };

  return (
    <Slider.Root
      className="group/slider min-w-0 flex-1"
      min={0}
      max={last}
      step={1}
      value={position}
      onValueChange={(value) => setDragging(typeof value === 'number' ? value : 0)}
      onValueCommitted={(value) => {
        setDragging(null);
        const next = typeof value === 'number' ? value : 0;
        onChange(next <= 0 ? null : (names[last - next] ?? null));
      }}
    >
      <Slider.Control className="flex h-5 w-full items-center px-1.5">
        <Slider.Track className="bg-muted-foreground/40 relative h-0.5 w-full rounded-full">
          <Slider.Thumb
            className="bg-background size-3.5 rounded-full border shadow-sm
              has-[:focus-visible]:outline-2"
            getAriaLabel={() => t('history.panel.rangeLabel')}
            getAriaValueText={(_, value) => rangeText(value)}
          >
            {/* パネルの上端で切れないよう、つまみの下に出す */}
            <span
              className="bg-popover text-popover-foreground pointer-events-none absolute top-5
                left-1/2 z-20 hidden rounded-md border px-1.5 py-0.5 text-2xs
                whitespace-nowrap shadow-sm group-has-[:focus-visible]/slider:block
                group-data-[dragging]/slider:block"
              style={{ transform: `translateX(-${String(shift)}%)` }}
              aria-hidden
            >
              {popoutText(position)}
            </span>
          </Slider.Thumb>
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}
