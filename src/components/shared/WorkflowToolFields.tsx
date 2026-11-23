import type { ParamDraft, ParamRow } from '@/components/shared/workflow-tool-draft';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { field } from '@/components/ui/field';
import type { ArgumentMode, OutputNode } from '@/graph/workflow-tool';
import { t, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';

const MODES: readonly { readonly mode: ArgumentMode; readonly label: MessageKey }[] = [
  { mode: 'overwrite', label: 'comfy.tool.modeOverwrite' },
  { mode: 'prepend', label: 'comfy.tool.modePrepend' },
  { mode: 'append', label: 'comfy.tool.modeAppend' },
];

export interface WorkflowToolPlace {
  readonly tabName: string | null;
  readonly tabId: string | null;
  readonly path: string | null;
}

export function PlaceInfo({ place }: { readonly place: WorkflowToolPlace }): React.ReactElement {
  const tab =
    place.tabName === null || place.tabId === null
      ? t('comfy.tool.tabClosed')
      : t('comfy.tool.tabWithId', { name: place.tabName, id: place.tabId });
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-3 text-sm">
      <dt>{t('comfy.tool.tab')}</dt>
      <dd className="text-muted-foreground truncate">{tab}</dd>
      <dt>{t('comfy.tool.file')}</dt>
      <dd className="text-muted-foreground truncate" title={place.path ?? undefined}>
        {place.path ?? t('comfy.tool.unsaved')}
      </dd>
    </dl>
  );
}

export function OutputChoice({
  nodes,
  labels,
  value,
  readOnly,
  onChange,
}: {
  readonly nodes: readonly OutputNode[];
  readonly labels: ReadonlyMap<number, string>;
  readonly value: readonly string[];
  readonly readOnly: boolean;
  readonly onChange: (value: readonly string[]) => void;
}): React.ReactElement {
  const toggle = (nodeId: string, on: boolean): void => {
    onChange(on ? [...value, nodeId] : value.filter((item) => item !== nodeId));
  };
  const onAllChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    if (event.target.checked) onChange([]);
  };
  return (
    <fieldset className="flex flex-col gap-1 text-sm" disabled={readOnly}>
      <legend className="mb-1">{t('comfy.tool.result')}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {nodes.length === 0 ? (
          <p className={EMPTY_NOTICE_CLASS}>{t('comfy.tool.noOutputs')}</p>
        ) : (
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={value.length === 0} onChange={onAllChange} />
            {t('comfy.tool.allOutputs')}
          </label>
        )}
        {nodes.map((node) => (
          <label key={node.nodeId} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={value.includes(node.nodeId)}
              onChange={(event) => toggle(node.nodeId, event.target.checked)}
            />
            {labels.get(Number(node.nodeId)) ?? node.nodeId}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ParamFields({
  row,
  value,
  readOnly,
  onChange,
}: {
  readonly row: ParamRow;
  readonly value: ParamDraft;
  readonly readOnly: boolean;
  readonly onChange: (patch: Partial<ParamDraft>) => void;
}): React.ReactElement {
  if (!row.eligible) {
    return (
      <p className="text-muted-foreground text-xs" title={t('comfy.tool.notEligible')}>
        {row.label}
      </p>
    );
  }
  const onModeChange = (event: React.ChangeEvent<HTMLSelectElement>): void =>
    onChange({
      mode: MODES.find((item) => item.mode === event.target.value)?.mode ?? 'overwrite',
    });
  return (
    <div className="grid grid-cols-9 gap-x-2 gap-y-1">
      <span className="col-span-9 truncate text-xs">{row.label}</span>
      <input
        className={cn(field({ size: 'xs', width: 'full' }), 'col-span-2')}
        aria-label={t('comfy.tool.paramName', { label: row.label })}
        placeholder={t('comfy.tool.paramNamePlaceholder')}
        readOnly={readOnly}
        value={value.name}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <div className="col-span-7 flex min-w-0 gap-2">
        <input
          className={cn(field({ size: 'xs', width: 'full' }), 'min-w-0')}
          aria-label={t('comfy.tool.paramDescription', { label: row.label })}
          placeholder={t('comfy.tool.paramDescriptionPlaceholder')}
          readOnly={readOnly}
          value={value.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        <select
          className={field({ size: 'xs' })}
          aria-label={t('comfy.tool.mode', { label: row.label })}
          disabled={readOnly || !row.mergeable}
          value={row.mergeable ? value.mode : 'overwrite'}
          onChange={onModeChange}
        >
          {MODES.map((item) => (
            <option key={item.mode} value={item.mode}>
              {t(item.label)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
