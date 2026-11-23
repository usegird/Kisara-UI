import { NumberField } from '@base-ui/react/number-field';
import { Triangle } from 'lucide-react';

import { t } from '@/i18n';
import {
  normalizeSlideshowSeconds,
  SLIDESHOW_SECONDS_MAX,
  SLIDESHOW_SECONDS_MIN,
} from '@/store/settings-fields/slideshow';
import { useSettingsStore } from '@/store/use-settings-store';

export interface SlideshowSecondsFieldProps {
  readonly id?: string | undefined;
  readonly className: string;
}

const STEP_BUTTON = `text-muted-foreground hover:text-foreground flex h-3 items-center px-0.5
  data-disabled:opacity-40`;

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
