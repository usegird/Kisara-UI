import { NumberField } from '@base-ui/react/number-field';
import { Triangle } from 'lucide-react';

import { t } from '@/i18n';
import {
  normalizeSlideshowSeconds,
  SLIDESHOW_SECONDS_MAX,
  SLIDESHOW_SECONDS_MIN,
} from '@/store/settings-fields/slideshow';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// スライドショーの送りの間隔（秒）の欄。ビューワーの帯と設定のタブで同じものを使う。
// ─────────────────────────────

/** 送りの間隔の欄の受け取り物 */
export interface SlideshowSecondsFieldProps {
  /** 欄の id（設定のタブの見出しが指す） */
  readonly id?: string | undefined;
  /** 欄そのものの見た目 */
  readonly className: string;
}

const STEP_BUTTON = `text-muted-foreground hover:text-foreground flex h-3 items-center px-0.5
  data-disabled:opacity-40`;

/**
 * 送りの間隔の数の欄。打鍵の途中の扱い・上下キー・読み上げは基盤（Base UI の NumberField）に任せる。
 * 増減は欄の左に上下の三角で置く（ブラウザの数の欄の送りは右にしか出せないため、自前のボタンにする）
 */
export function SlideshowSecondsField({
  id,
  className,
}: SlideshowSecondsFieldProps): React.ReactElement {
  const seconds = useSettingsStore((state) => state.slideshowSeconds);
  const setSeconds = useSettingsStore((state) => state.setSlideshowSeconds);

  return (
    <NumberField.Root
      id={id}
      value={seconds}
      min={SLIDESHOW_SECONDS_MIN}
      max={SLIDESHOW_SECONDS_MAX}
      step={1}
      // 空にした途中（null）は書かない。離れると基盤が今の値に戻す
      onValueChange={(value) => {
        if (value !== null) setSeconds(normalizeSlideshowSeconds(value));
      }}
    >
      <NumberField.Group className="flex items-center">
        <span className="flex flex-col">
          <NumberField.Increment
            className={STEP_BUTTON}
            aria-label={t('settings.slideshow.increase')}
          >
            <Triangle className="size-2 fill-current" aria-hidden />
          </NumberField.Increment>
          <NumberField.Decrement
            className={STEP_BUTTON}
            aria-label={t('settings.slideshow.decrease')}
          >
            <Triangle className="size-2 rotate-180 fill-current" aria-hidden />
          </NumberField.Decrement>
        </span>
        <NumberField.Input className={className} aria-label={t('settings.slideshow.label')} />
      </NumberField.Group>
    </NumberField.Root>
  );
}
