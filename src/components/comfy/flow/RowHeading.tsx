import { cva } from 'class-variance-authority';
import { PanelsTopLeft } from 'lucide-react';
import { useContext } from 'react';

import { AnchorContext, appTargetAnchorKey } from '@/components/comfy/flow/anchor-context';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import type { NodeRowProps } from '@/components/comfy/flow/NodeRow';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { truncate } from '@/lib/text';
import { slotColor } from '@/styles/slot-color';

const rowHeading = cva('group/head text-muted-foreground flex shrink-0 items-center gap-1.5', {
  variants: {
    stacked: { true: 'w-full', false: '' },
    compact: { true: '', false: 'pl-1' },
  },
  compoundVariants: [
    { stacked: false, compact: false, class: 'w-28' },
    { stacked: false, compact: true, class: 'w-[92px]' },
  ],
});

const addBeforeButton = cva(
  [
    'absolute top-1/2 z-10 flex -translate-y-1/2 items-center justify-center',
    'transition-opacity hover:opacity-100 focus:opacity-100',
  ],
  { variants: { connected: { true: 'opacity-0', false: 'opacity-40' } } },
);

const addBeforeArrow = cva('block h-0 w-0 border-y-[5px] border-y-transparent', {
  variants: { connected: { true: 'border-l-[6px]', false: 'border-r-[6px]' } },
});

const appInputToggle = cva('shrink-0 rounded p-0.5 transition-opacity', {
  variants: {
    compact: { true: '-mr-[1.5px] ml-[1.5px]', false: '-ml-0.5 mr-0.5' },
    on: {
      true: 'text-slot-conditioning',
      false: 'opacity-0 group-hover/head:opacity-100 focus:opacity-100',
    },
  },
});

const LABEL_MAX = 12;

interface AddBeforeButtonProps {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly onAddBefore: (id: number, row: NodeRowData) => void;
}

export function AddBeforeButton({
  nodeId,
  row,
  onAddBefore,
}: AddBeforeButtonProps): React.ReactElement {
  const connected = row.kind === 'link';
  return (
    <button
      type="button"
      className={addBeforeButton({ connected })}
      style={{ ...(connected ? { left: -5 } : { right: 2 }), width: 8, height: 14 }}
      {...MENU_ACTION}
      aria-label={t('flow.row.insertBeforeLabel', { name: row.label })}
      title={t('flow.row.insertBeforeTitle')}
      onClick={() => onAddBefore(nodeId, row)}
    >
      <span
        aria-hidden
        className={addBeforeArrow({ connected })}
        style={
          connected
            ? { borderLeftColor: slotColor(row.type) }
            : { borderRightColor: slotColor(row.type) }
        }
      />
    </button>
  );
}

interface RowHeadingProps {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly stacked: boolean;
  readonly onToggleAppInput: NodeRowProps['onToggleAppInput'];
}

export function RowHeading({
  nodeId,
  row,
  stacked,
  onToggleAppInput,
}: RowHeadingProps): React.ReactElement {
  const { compact } = useContext(FlowLookContext);
  return (
    <span className={rowHeading({ stacked, compact })}>
      {onToggleAppInput && row.kind === 'widget' ? (
        <AppInputToggle nodeId={nodeId} row={row} onToggleAppInput={onToggleAppInput} />
      ) : onToggleAppInput ? (
        <span aria-hidden className="-ml-0.5 mr-0.5 w-[18px] shrink-0" />
      ) : row.appInput ? (
        <AppInputMark nodeId={nodeId} row={row} />
      ) : null}
      <span className="min-w-0 truncate" title={row.label}>
        {truncate(row.label, LABEL_MAX)}
      </span>
    </span>
  );
}

function AppInputMark({
  nodeId,
  row,
}: {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
}): React.ReactElement {
  const anchors = useContext(AnchorContext);
  return (
    <span
      ref={anchors?.register(appTargetAnchorKey(nodeId, row.widgetName))}
      className="text-slot-conditioning -ml-0.5 mr-0.5 shrink-0 p-0.5"
      title={t('flow.row.appInputOnTitle')}
    >
      <PanelsTopLeft className="size-3.5" aria-hidden />
    </span>
  );
}

interface AppInputToggleProps {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly onToggleAppInput: (id: number, widgetName: string) => void;
}

function AppInputToggle({
  nodeId,
  row,
  onToggleAppInput,
}: AppInputToggleProps): React.ReactElement {
  const anchors = useContext(AnchorContext);
  const { compact } = useContext(FlowLookContext);
  const appAnchor = row.appInput
    ? anchors?.register(appTargetAnchorKey(nodeId, row.widgetName))
    : null;
  return (
    <button
      ref={appAnchor ?? undefined}
      type="button"
      className={appInputToggle({ compact, on: row.appInput })}
      {...MENU_ACTION}
      aria-label={t(row.appInput ? 'flow.row.removeAppInput' : 'flow.row.addAppInput', {
        name: row.label,
      })}
      aria-pressed={row.appInput}
      title={row.appInput ? t('flow.row.appInputOnTitle') : t('flow.row.appInputOffTitle')}
      onClick={() => onToggleAppInput(nodeId, row.widgetName)}
    >
      <PanelsTopLeft className="size-3.5" aria-hidden />
    </button>
  );
}
