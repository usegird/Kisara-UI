import { cva } from 'class-variance-authority';

import { formatPrices } from '@/components/llm/dialogs/model-price-text';
import { t } from '@/i18n';
import { splitPath } from '@/lib/path-tree';
import type { ModelDetails } from '@/port/llm-port';

const row = cva('hover:bg-accent flex w-full flex-col rounded px-2 py-1 text-left', {
  variants: { selected: { true: 'bg-accent', false: '' } },
});

export function ModelRow({
  model,
  custom,
  details,
  showDirectory,
  selected,
  onSelect,
  onDecide,
}: {
  readonly model: string;
  readonly custom: boolean;
  readonly details: ModelDetails | undefined;
  readonly showDirectory: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDecide: () => void;
}): React.ReactElement {
  const { directory, label } = splitPath(model);
  const prices = details === undefined ? '' : formatPrices(details.prices);
  return (
    <button
      type="button"
      className={row({ selected })}
      title={model}
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={onDecide}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onDecide();
      }}
    >
      {custom ? (
        <span className="truncate">{t('llm.modelPicker.useTyped', { name: model })}</span>
      ) : (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">{label}</span>
          {showDirectory && directory !== '' ? (
            <span className="text-muted-foreground truncate">{directory}</span>
          ) : null}
        </span>
      )}
      {prices.length === 0 ? null : (
        <span className="text-muted-foreground truncate tabular-nums">{prices}</span>
      )}
    </button>
  );
}
