import { useState } from 'react';

import { DialogFrame } from '@/components/ui/dialog';
import { dialogButton } from '@/components/ui/dialog-button';
import { field } from '@/components/ui/field';
import { readNodeSettings, type NodeSettingsPatch } from '@/graph/node-settings';
import type { WorkflowNode } from '@/graph/types';
import { t } from '@/i18n';

const FIELD_CLASS = field({ size: 'xs', width: 'full' });

export interface NodeSettingsDialogProps {
  readonly node: WorkflowNode;
  readonly displayName: string;
  readonly onChange: (patch: NodeSettingsPatch) => void;
  readonly onClose: () => void;
}

function FlagCheckbox({
  label,
  title,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly title?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): React.ReactElement {
  return (
    <label className="text-muted-foreground flex items-center gap-2 text-xs" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function numberOrNull(text: string): number | null {
  if (text.trim().length === 0) return null;

  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function NodeSettingsDialog({
  node,
  displayName,
  onChange,
  onClose,
}: NodeSettingsDialogProps): React.ReactElement {
  const settings = readNodeSettings(node);
  const [x, setX] = useState(settings.x === null ? '' : String(settings.x));
  const [y, setY] = useState(settings.y === null ? '' : String(settings.y));
  const [width, setWidth] = useState(settings.width === null ? '' : String(settings.width));
  const [height, setHeight] = useState(settings.height === null ? '' : String(settings.height));

  const extraKeys = Object.keys(settings.extra);

  return (
    <DialogFrame
      id="node-settings"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="sm"
      title={t('nodeSettings.title', { name: displayName })}
      subtitle={`#${String(settings.id)} / ${settings.classType}`}
    >
      <div className="p-4">
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="text-muted-foreground text-xs">
            {t('nodeSettings.x')}
            <input
              className={FIELD_CLASS}
              type="number"
              value={x}
              aria-label={t('nodeSettings.x')}
              onChange={(event) => setX(event.target.value)}
              onBlur={() => {
                const next = numberOrNull(x);
                if (next !== null) onChange({ x: next });
              }}
            />
          </label>
          <label className="text-muted-foreground text-xs">
            {t('nodeSettings.y')}
            <input
              className={FIELD_CLASS}
              type="number"
              value={y}
              aria-label={t('nodeSettings.y')}
              onChange={(event) => setY(event.target.value)}
              onBlur={() => {
                const next = numberOrNull(y);
                if (next !== null) onChange({ y: next });
              }}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-muted-foreground text-xs">
            {t('nodeSettings.width')}
            <input
              className={FIELD_CLASS}
              type="number"
              value={width}
              aria-label={t('nodeSettings.width')}
              placeholder={t('nodeSettings.auto')}
              onChange={(event) => setWidth(event.target.value)}
              onBlur={() => onChange({ width: numberOrNull(width) })}
            />
          </label>
          <label className="text-muted-foreground text-xs">
            {t('nodeSettings.height')}
            <input
              className={FIELD_CLASS}
              type="number"
              value={height}
              aria-label={t('nodeSettings.height')}
              placeholder={t('nodeSettings.auto')}
              onChange={(event) => setHeight(event.target.value)}
              onBlur={() => onChange({ height: numberOrNull(height) })}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <FlagCheckbox
            label={t('nodeSettings.pinned')}
            title={t('nodeSettings.pinnedTitle')}
            checked={settings.pinned}
            onChange={(pinned) => onChange({ pinned })}
          />
        </div>

        {extraKeys.length > 0 ? (
          <details className="mt-3">
            <summary className="text-muted-foreground cursor-pointer text-xs">
              {t('nodeSettings.extra', { count: extraKeys.length })}
            </summary>
            <pre className="bg-muted mt-2 max-h-48 overflow-auto rounded p-2 text-2xs">
              {JSON.stringify(settings.extra, null, 2)}
            </pre>
          </details>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button type="button" className={dialogButton({ tone: 'secondary' })} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
