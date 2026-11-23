import { DecideButton } from '@/components/ui/decide-button';
import { t } from '@/i18n';
import type { TextField } from '@/lib/insert-at-caret';
import { placeEntry } from '@/lib/insert-motion';

export interface InsertButtonProps {
  readonly text: string;
  readonly label: string;
  readonly field: TextField | null;
  readonly caption?: string | undefined;
  readonly onPlaced: () => void;
}

export function InsertButton({
  text,
  label,
  field,
  caption,
  onPlaced,
}: InsertButtonProps): React.ReactElement {
  const onClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (field === null) return;
    const origin = event.currentTarget.getBoundingClientRect();
    if (placeEntry(field, text, origin)) onPlaced();
  };
  return (
    <DecideButton
      label={label}
      caption={caption}
      title={t(field === null ? 'comfy.insert.noFieldTitle' : 'comfy.insert.title')}
      disabled={field === null || text.length === 0}
      onClick={onClick}
    />
  );
}
