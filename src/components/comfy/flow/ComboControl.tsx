import { ImagePickerDialog } from '@/components/comfy/flow/dialogs/ImagePickerDialog';
import { ModelPickerDialog } from '@/components/comfy/flow/dialogs/ModelPickerDialog';
import { folderLabel } from '@/components/comfy/flow/model-folder-label';
import { ModelPickerField } from '@/components/comfy/flow/ModelPickerField';
import { widgetControl, type WidgetAppearance } from '@/components/comfy/flow/widget-style';
import type { Commit, WidgetControlProps } from '@/components/comfy/flow/WidgetControl';
import { matchModelFolder, type ModelFile } from '@/graph/model-files';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import { useImageUpload } from '@/hooks/comfy/use-image-upload';
import type { ModelFiles } from '@/hooks/flow/use-model-files';
import { t } from '@/i18n';
import { formatDisplayValue } from '@/i18n/format';
import { formatEditValue } from '@/lib/text';

interface ComboControlProps {
  readonly row: NodeRowData;
  readonly current: unknown;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly models: ModelFiles;
  readonly onCommit: Commit;
  readonly onNeedOptions: WidgetControlProps['onNeedOptions'];
}

export function ComboControl({
  row,
  current,
  placeholder,
  appearance,
  models,
  onCommit,
  onNeedOptions,
}: ComboControlProps): React.ReactElement {
  const empty = formatEditValue(current) === '';
  const asPlaceholder = empty && placeholder !== undefined;

  if (row.options === null) {
    return (
      <button
        type="button"
        className={widgetControl({ appearance, muted: empty }, 'truncate text-left')}
        aria-label={t('flow.widget.loadOptionsLabel', { name: row.label })}
        onClick={() => onNeedOptions?.(row)}
        title={t('flow.widget.loadOptionsTitle')}
      >
        {pickerTextOf(current, empty, placeholder)}
      </button>
    );
  }
  if (row.imageUpload) {
    return (
      <ImageCombo
        row={row}
        options={row.options}
        current={current}
        placeholder={placeholder}
        appearance={appearance}
        onCommit={onCommit}
      />
    );
  }
  const folder = matchModelFolder(row.options, models.indexes);
  const folderIndex = folder === null ? null : (models.indexes.get(folder) ?? null);

  if (folder !== null && folderIndex !== null) {
    return (
      <ModelCombo
        row={row}
        options={row.options}
        current={current}
        placeholder={placeholder}
        appearance={appearance}
        folder={folder}
        folderIndex={folderIndex}
        models={models}
        onCommit={onCommit}
      />
    );
  }
  return (
    <OptionSelect
      row={row}
      options={row.options}
      text={formatEditValue(current)}
      asPlaceholder={asPlaceholder}
      placeholder={placeholder}
      appearance={appearance}
      onCommit={onCommit}
    />
  );
}

interface ModelComboProps {
  readonly row: NodeRowData;
  readonly options: readonly unknown[];
  readonly current: unknown;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly folder: string;
  readonly folderIndex: ReadonlyMap<string, ModelFile>;
  readonly models: ModelFiles;
  readonly onCommit: Commit;
}

function ModelCombo({
  row,
  options,
  current,
  placeholder,
  appearance,
  folder,
  folderIndex,
  models,
  onCommit,
}: ModelComboProps): React.ReactElement {
  const empty = formatEditValue(current) === '';
  const shown = pickerTextOf(current, empty, placeholder);
  return (
    <ModelPickerDialog
      dialogId="model-picker"
      modal
      placeMode="set"
      folder={folder}
      subtitle={row.label}
      trigger={
        <ModelPickerField
          label={row.label}
          kind={folderLabel(folder)}
          text={shown}
          muted={empty}
          appearance={appearance}
          onClear={empty ? undefined : () => onCommit(row, '')}
          clearLabel={t(
            placeholder === undefined ? 'flow.widget.clear' : 'flow.widget.resetToCard',
          )}
        />
      }
      value={formatEditValue(current)}
      options={options}
      index={folderIndex}
      baseUrl={models.baseUrl}
      loading={models.statusOf(folder) === 'loading'}
      onRefresh={() => models.refresh(folder)}
      onPlace={(next) => {
        onCommit(row, next);
        return null;
      }}
    />
  );
}

interface ImageComboProps {
  readonly row: NodeRowData;
  readonly options: readonly unknown[];
  readonly current: unknown;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly onCommit: Commit;
}

function ImageCombo({
  row,
  options,
  current,
  placeholder,
  appearance,
  onCommit,
}: ImageComboProps): React.ReactElement {
  const className = uploadClassOf(row.target);
  const upload = useImageUpload(className);
  const empty = formatEditValue(current) === '';
  const shown = pickerTextOf(current, empty, placeholder);
  return (
    <ImagePickerDialog
      subtitle={row.label}
      trigger={
        <ModelPickerField
          label={row.label}
          kind={t('imagePicker.kind')}
          text={shown}
          muted={empty}
          appearance={appearance}
          onClear={empty ? undefined : () => onCommit(row, '')}
          clearLabel={t(
            placeholder === undefined ? 'flow.widget.clear' : 'flow.widget.resetToCard',
          )}
        />
      }
      value={formatEditValue(current)}
      options={options}
      upload={upload}
      onPlace={(next) => onCommit(row, next)}
    />
  );
}

interface OptionSelectProps {
  readonly row: NodeRowData;
  readonly options: readonly unknown[];
  readonly text: string;
  readonly asPlaceholder: boolean;
  readonly placeholder: string | undefined;
  readonly appearance: WidgetAppearance;
  readonly onCommit: Commit;
}

function OptionSelect({
  row,
  options,
  text,
  asPlaceholder,
  placeholder,
  appearance,
  onCommit,
}: OptionSelectProps): React.ReactElement {
  const stray = !asPlaceholder && !options.some((option) => formatEditValue(option) === text);

  return (
    <select
      className={widgetControl({ appearance, muted: asPlaceholder, invalid: stray })}
      value={text}
      aria-label={row.label}
      title={stray ? t('flow.widget.stray') : undefined}
      onChange={(event) => onCommit(row, event.target.value)}
    >
      {placeholder === undefined ? null : <option value="">{placeholder}</option>}
      {stray ? (
        <option value={text} className="text-destructive">
          {text === '' ? t('flow.widget.unselected') : text}
        </option>
      ) : null}
      {options.map((option) => (
        <option
          key={formatEditValue(option)}
          value={formatEditValue(option)}
          className="text-foreground"
        >
          {formatEditValue(option)}
        </option>
      ))}
    </select>
  );
}

function pickerTextOf(current: unknown, empty: boolean, placeholder: string | undefined): string {
  if (!empty) return formatDisplayValue(current);
  return placeholder === undefined || placeholder === ''
    ? t('flow.widget.unselected')
    : placeholder;
}

function uploadClassOf(target: ImageComboProps['row']['target']): string | null {
  if (target === null) return null;
  return target.kind === 'node' ? target.classType : target.innerClassType;
}
