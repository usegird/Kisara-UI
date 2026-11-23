import { Pencil, Save, X } from 'lucide-react';

import { t } from '@/i18n';

import type { SaveState } from './use-edit-save';

export const EDIT_FIELD_CLASS =
  'border-input bg-background min-h-20 w-full resize-y rounded-md border px-2 py-1 ' +
  'text-xs leading-snug';

const ICON_BUTTON =
  'text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1 ' +
  'disabled:pointer-events-none disabled:opacity-40';

export interface EditSaveButtonProps {
  readonly editing: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly editLabel: string;
  readonly cancelLabel: string;
  readonly saveLabel: string;
  readonly onEdit: () => void;
  readonly onSave: () => void;
}

export function EditSaveButton({
  editing,
  dirty,
  saving,
  editLabel,
  cancelLabel,
  saveLabel,
  onEdit,
  onSave,
}: EditSaveButtonProps): React.ReactElement {
  const mode = !editing ? 'edit' : dirty ? 'save' : 'cancel';
  const label = { edit: editLabel, cancel: cancelLabel, save: saveLabel }[mode];
  const Icon = { edit: Pencil, cancel: X, save: Save }[mode];
  return (
    <button
      type="button"
      className={ICON_BUTTON}
      aria-label={label}
      title={label}
      disabled={saving}
      onClick={editing ? onSave : onEdit}
    >
      <Icon className="size-3" aria-hidden />
    </button>
  );
}

export function SaveMessage({ state }: { readonly state: SaveState }): React.ReactElement | null {
  if (state.kind === 'idle') return null;
  if (state.kind === 'failed') {
    return (
      <span className="text-destructive min-w-0 break-all" role="alert">
        {t('modelPicker.info.notesSaveFailed', { error: state.error })}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground" role="status">
      {t(state.kind === 'saving' ? 'modelPicker.info.notesSaving' : 'modelPicker.info.notesSaved')}
    </span>
  );
}
