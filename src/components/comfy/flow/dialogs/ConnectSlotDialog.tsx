import { cva } from 'class-variance-authority';

import { DialogFrame } from '@/components/ui/dialog';
import { dialogButton } from '@/components/ui/dialog-button';
import type { ConnectChoice } from '@/hooks/flow/use-node-editing';
import { t } from '@/i18n';
import { slotColor } from '@/styles/slot-color';

const slotType = cva('ml-auto shrink-0 tabular-nums', {
  variants: { matches: { true: 'text-foreground', false: 'text-muted-foreground' } },
});

export interface ConnectSlotDialogProps {
  readonly choice: ConnectChoice | null;
  readonly onResolve: (slot: number | null) => void;
}

export function ConnectSlotDialog({
  choice,
  onResolve,
}: ConnectSlotDialogProps): React.ReactElement {
  return (
    <DialogFrame
      id="connect-slot"
      open={choice !== null}
      onOpenChange={(next) => {
        if (!next) onResolve(null);
      }}
      size="sm"
      title={t('flow.connectSlot.title')}
      description={
        choice === null
          ? ''
          : t(
              choice.side === 'output'
                ? 'flow.connectSlot.pickOutput'
                : 'flow.connectSlot.pickInput',
              {
                name: choice.definition.displayName,
                type: choice.type,
              },
            )
      }
    >
      <div className="p-4 pt-3">
        <ul className="flex flex-col gap-1">
          {(choice?.choices ?? []).map((entry) => (
            <li key={entry.slot}>
              <button
                type="button"
                className="hover:bg-accent flex w-full items-center gap-2 rounded border px-2
                    py-1.5 text-left text-xs"
                onClick={() => onResolve(entry.slot)}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: slotColor(entry.type) }}
                />
                <span className="min-w-0 truncate">{entry.name}</span>
                <span className={slotType({ matches: entry.matches })}>
                  {entry.type}
                  {entry.matches ? '' : t('flow.connectSlot.typeMismatch')}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className={dialogButton({ tone: 'secondary' })}
            onClick={() => onResolve(null)}
          >
            {t('flow.connectSlot.addUnconnected')}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
