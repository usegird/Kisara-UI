import { Braces, Loader2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { CopyButton } from '@/components/ui/copy-button';
import { InsertIconButton } from '@/components/ui/insert-icon-button';
import {
  ACTIVATION_TEXT_KEY,
  modelJsonFields,
  parseWeightInput,
  PREFERRED_WEIGHT_KEY,
  weightText,
  type ModelJsonField,
} from '@/graph/model-json-edits';
import { useModelJson, type ModelJsonState } from '@/hooks/flow/use-model-json';
import { t } from '@/i18n';

import { EDIT_FIELD_CLASS, EditSaveButton, SaveMessage } from './EditSaveControls';
import { INFO_SECTION_CLASS, InfoHeading } from './InfoHeading';
import type { InfoInsert } from './ModelNotes';
import { useEditSave } from './use-edit-save';

const WEIGHT_STEP = '0.1';

const WEIGHT_FIELD_CLASS =
  'border-input bg-background w-24 rounded-md border px-2 py-1 text-xs leading-snug';

export interface ModelJsonProps {
  readonly folder: string;
  readonly filename: string;
  readonly insert?: InfoInsert | undefined;
}

export function ModelJson({ folder, filename, insert }: ModelJsonProps): React.ReactElement | null {
  const state = useModelJson(folder, filename);
  const headingId = useId();

  if (state.status === 'idle') return null;
  return (
    <section aria-labelledby={headingId} className={INFO_SECTION_CLASS}>
      <InfoHeading id={headingId} icon={Braces} label={t('modelPicker.info.json')} />
      {state.status === 'loading' ? (
        <p className="text-muted-foreground flex items-center gap-2" role="status">
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          {t('modelPicker.info.jsonLoading')}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="text-destructive break-all">
          {t('modelPicker.info.jsonFailed', { error: state.error ?? '' })}
        </p>
      ) : null}
      {state.source === null ? null : (
        <dl className="space-y-1">
          {modelJsonFields(state.source).map((field) => (
            <Field key={field.key} field={field} state={state} insert={insert} />
          ))}
        </dl>
      )}
    </section>
  );
}

interface FieldProps {
  readonly field: ModelJsonField;
  readonly state: ModelJsonState;
  readonly insert: InfoInsert | undefined;
}

function Field({ field, state, insert }: FieldProps): React.ReactElement {
  const weight = field.key === PREFERRED_WEIGHT_KEY;
  const initial = weight ? weightText(field.value) : field.value;
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const edit = useEditSave({
    dirty: draft !== initial,
    save: () => state.save(field.key, weight ? parseWeightInput(draft) : draft),
    focus: () => requestAnimationFrame(() => input.current?.focus()),
  });
  const onChange = (value: string): void => {
    setDraft(value);
    edit.onChanged();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        <dt className="text-muted-foreground min-w-0 break-all">{field.key}</dt>
        {field.key === ACTIVATION_TEXT_KEY ? (
          <ActivationTextActions text={field.value.trim()} insert={insert} />
        ) : null}
        {field.editable ? (
          <EditSaveButton
            editing={edit.editing}
            dirty={edit.dirty}
            saving={edit.saveState.kind === 'saving'}
            editLabel={t('modelPicker.info.jsonEdit', { key: field.key })}
            cancelLabel={t('modelPicker.info.jsonCancel', { key: field.key })}
            saveLabel={t('modelPicker.info.jsonSave', { key: field.key })}
            onEdit={edit.onEdit}
            onSave={() => void edit.onSave()}
          />
        ) : null}
        <SaveMessage state={edit.saveState} />
      </div>
      <dd className="min-w-0">
        {edit.editing ? (
          <FieldInput
            ref={input}
            weight={weight}
            label={field.key}
            value={draft}
            onChange={onChange}
          />
        ) : (
          <div className="max-h-20 overflow-y-auto break-all whitespace-pre-wrap">
            {field.value}
          </div>
        )}
      </dd>
    </div>
  );
}

interface FieldInputProps {
  readonly ref: React.Ref<HTMLTextAreaElement & HTMLInputElement>;
  readonly weight: boolean;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

function FieldInput({ ref, weight, label, value, onChange }: FieldInputProps): React.ReactElement {
  if (weight) {
    return (
      <input
        ref={ref}
        type="number"
        step={WEIGHT_STEP}
        className={WEIGHT_FIELD_CLASS}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <textarea
      ref={ref}
      className={EDIT_FIELD_CLASS}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

interface ActivationTextActionsProps {
  readonly text: string;
  readonly insert: InfoInsert | undefined;
}

function ActivationTextActions({
  text,
  insert,
}: ActivationTextActionsProps): React.ReactElement | null {
  if (text.length === 0) return null;
  return (
    <>
      <CopyButton iconOnly frameless text={text} label={t('modelPicker.info.copyActivationText')} />
      {insert === undefined ? null : (
        <InsertIconButton
          label={t('modelPicker.info.insertActivationText')}
          blocked={insert.blocked}
          onInsert={() => insert.onInsert(text)}
        />
      )}
    </>
  );
}
