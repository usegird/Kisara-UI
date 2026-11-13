import { cva } from 'class-variance-authority';
import { Pin } from 'lucide-react';

import { t } from '@/i18n';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// 列のピン止めのボタン。右の列と会話の左の列で同じ見た目にする。
// ─────────────────────────────

const pinButton = cva(
  `flex size-7 shrink-0 items-center justify-center rounded focus-visible:outline-2`,
  {
    variants: {
      pinned: {
        true: 'text-foreground hover:bg-muted',
        false: 'text-muted-foreground hover:text-foreground hover:bg-muted',
      },
    },
  },
);
const pinIcon = cva('size-4', {
  variants: { pinned: { true: 'fill-current', false: '-rotate-45' } },
});

/** ピン止めのボタンの props */
export interface PinButtonProps {
  /** 止めているか。止めていれば列として出し続け、外せば細い 1 列に縮める */
  readonly pinned: boolean;
  readonly onToggle: () => void;
  readonly className?: string | undefined;
}

/** ピン止めを入れ切りするボタン */
export function PinButton({ pinned, onToggle, className }: PinButtonProps): React.ReactElement {
  const label = t(pinned ? 'app.pin.unpin' : 'app.pin.pin');
  return (
    <button
      type="button"
      className={cn(pinButton({ pinned }), className)}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <Pin className={pinIcon({ pinned })} aria-hidden />
    </button>
  );
}
