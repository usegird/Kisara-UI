import { useState } from 'react';

import { ComboControl } from '@/components/comfy/flow/ComboControl';
import { TextControl } from '@/components/comfy/flow/TextControl';
import { widgetControl, type WidgetAppearance } from '@/components/comfy/flow/widget-style';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import { useModelFiles } from '@/hooks/flow/use-model-files';
import { formatDisplayValue } from '@/i18n/format';
import { formatEditValue } from '@/lib/text';

export interface WidgetControlProps {
  readonly row: NodeRowData;
  readonly onCommit?: ((row: NodeRowData, value: unknown) => void) | undefined;
  readonly onNeedOptions?: ((row: NodeRowData) => void) | undefined;
  readonly readOnly?: boolean | undefined;
  readonly value?: unknown;
  readonly placeholder?: string | undefined;
  readonly appearance?: WidgetAppearance | undefined;
  readonly height?: number | undefined;
}

export function WidgetControl({
  row,
  onCommit,
  onNeedOptions,
  readOnly = false,
  value,
  placeholder,
  appearance = 'box',
  height,
}: WidgetControlProps): React.ReactElement {
  const current = value === undefined ? row.value : value;
  const [draft, setDraft] = useState(() => formatEditValue(current));
  const [synced, setSynced] = useState(() => formatEditValue(current));
  if (formatEditValue(current) !== synced) {
    setSynced(formatEditValue(current));
    setDraft(formatEditValue(current));
  }
  const models = useModelFiles(row.type === 'COMBO' && row.options !== null);
  const editable = !readOnly && row.target !== null && onCommit !== undefined;

  if (!editable) {
    return <ReadOnlyValue current={current} multiline={row.multiline} appearance={appearance} />;
  }
  if (row.type === 'BOOLEAN') {
    return <BooleanControl row={row} current={current} onCommit={onCommit} />;
  }
  if (row.type === 'COMBO') {
    return (
      <ComboControl
        row={row}
        current={current}
        placeholder={placeholder}
        appearance={appearance}
        models={models}
        onCommit={onCommit}
        onNeedOptions={onNeedOptions}
      />
    );
  }
  return (
    <TextControl
      row={row}
      current={current}
      draft={draft}
      onDraft={setDraft}
      placeholder={placeholder}
      appearance={appearance}
      height={height}
      onCommit={onCommit}
    />
  );
}

export type Commit = (row: NodeRowData, value: unknown) => void;

interface ReadOnlyValueProps {
  readonly current: unknown;
  readonly multiline: boolean;
  readonly appearance: WidgetAppearance;
}

function ReadOnlyValue({ current, multiline, appearance }: ReadOnlyValueProps): React.ReactElement {
  if (multiline) {
    return (
      <span
        className={widgetControl(
          { appearance, multiline: true },
          'block resize-none whitespace-pre-wrap opacity-60',
        )}
      >
        {formatDisplayValue(current)}
      </span>
    );
  }
  return (
    <span className={widgetControl({ appearance }, 'block truncate opacity-60')}>
      {formatDisplayValue(current)}
    </span>
  );
}

interface BooleanControlProps {
  readonly row: NodeRowData;
  readonly current: unknown;
  readonly onCommit: Commit;
}

function BooleanControl({ row, current, onCommit }: BooleanControlProps): React.ReactElement {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={current === true}
        aria-label={row.label}
        onChange={(event) => onCommit(row, event.target.checked)}
      />
      {current === true ? 'ON' : 'OFF'}
    </label>
  );
}
