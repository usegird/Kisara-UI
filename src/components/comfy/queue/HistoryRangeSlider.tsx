import { Slider } from '@base-ui/react/slider';
import { useState } from 'react';

import { PERCENT } from '@/components/ui/units';
import { t } from '@/i18n';

export interface HistoryRangeSliderProps {
  readonly names: readonly string[];
  readonly labels: readonly string[];
  readonly upTo: string | null;
  readonly onChange: (upTo: string | null) => void;
}

export function HistoryRangeSlider({
  names,
  labels,
  upTo,
  onChange,
}: HistoryRangeSliderProps): React.ReactElement {
  const last = names.length - 1;
  const chosen = upTo === null ? 0 : last - Math.max(0, names.indexOf(upTo));
  const [dragging, setDragging] = useState<number | null>(null);
  const position = dragging ?? chosen;
  const rangeText = (value: number): string => {
    const label = labels[last - value];
    return value <= 0 || label === undefined
      ? t('history.panel.rangeAll')
      : t('history.panel.rangeUpTo', { date: label });
  };
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
