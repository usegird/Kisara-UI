import { FileText, Loader2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { CopyButton } from '@/components/ui/copy-button';
import { InsertIconButton } from '@/components/ui/insert-icon-button';
import { useModelNotes, type ModelNotes as ModelNotesValue } from '@/hooks/flow/use-model-notes';
import { t } from '@/i18n';

import { EDIT_FIELD_CLASS, EditSaveButton, SaveMessage } from './EditSaveControls';
import { INFO_SECTION_CLASS, InfoHeading } from './InfoHeading';
import { useEditSave } from './use-edit-save';

export interface InfoInsert {
  readonly blocked: string | null;
  readonly onInsert: (text: string) => void;
}

export interface ModelNotesProps {
  readonly folder: string;
  readonly filename: string;
  readonly insert?: InfoInsert | undefined;
}

export function ModelNotes({ folder, filename, insert }: ModelNotesProps): React.ReactElement {
  const notes = useModelNotes(folder, filename);
  const headingId = useId();

  if (notes.status === 'ready') {
    return <NotesEditor notes={notes} saved={notes.text} headingId={headingId} insert={insert} />;
  }
  return (
    <section aria-labelledby={headingId} className={INFO_SECTION_CLASS}>
      <NotesHeading id={headingId} />
      <NotesStatus notes={notes} />
    </section>
  );
}

interface NotesHeadingProps {
  readonly id: string;
  readonly children?: React.ReactNode;
}

function NotesHeading({ id, children }: NotesHeadingProps): React.ReactElement {
  return (
    <InfoHeading id={id} icon={FileText} label={t('modelPicker.info.notes')}>
      {children}
    </InfoHeading>
  );
}

function NotesStatus({ notes }: { readonly notes: ModelNotesValue }): React.ReactElement | null {
  if (notes.status === 'error') {
    return (
      <p className="text-destructive break-all">
        {t('modelPicker.info.notesFailed', { error: notes.error ?? '' })}
      </p>
    );
  }
  if (notes.status !== 'loading') return null;
  return (
    <p className="text-muted-foreground flex items-center gap-2" role="status">
      <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
      {t('modelPicker.info.notesLoading')}
    </p>
  );
}

interface NotesEditorProps {
  readonly notes: ModelNotesValue;
  readonly saved: string | null;
  readonly headingId: string;
  readonly insert: InfoInsert | undefined;
}

function NotesEditor({ notes, saved, headingId, insert }: NotesEditorProps): React.ReactElement {
  const [draft, setDraft] = useState(saved ?? '');
  const field = useRef<HTMLTextAreaElement>(null);
  const edit = useEditSave({
    dirty: draft !== (saved ?? ''),
    save: () => notes.save(draft),
    focus: () => requestAnimationFrame(() => field.current?.focus()),
  });

  return (
    <section aria-labelledby={headingId} className={INFO_SECTION_CLASS}>
      <NotesHeading id={headingId}>
        {draft.trim().length === 0 ? null : (
          <>
            <CopyButton iconOnly frameless text={draft} label={t('modelPicker.info.copyNotes')} />
            {insert === undefined ? null : (
              <InsertIconButton
                label={t('modelPicker.info.insertNotes')}
                blocked={insert.blocked}
                onInsert={() => insert.onInsert(draft.trim())}
              />
            )}
          </>
        )}
        <EditSaveButton
          editing={edit.editing}
          dirty={edit.dirty}
          saving={edit.saveState.kind === 'saving'}
          editLabel={t('modelPicker.info.notesEdit')}
          cancelLabel={t('modelPicker.info.notesCancel')}
          saveLabel={t('modelPicker.info.notesSave')}
          onEdit={edit.onEdit}
          onSave={() => void edit.onSave()}
        />
        <SaveMessage state={edit.saveState} />
      </NotesHeading>
      {edit.editing ? (
        <textarea
          ref={field}
          className={EDIT_FIELD_CLASS}
          value={draft}
          aria-labelledby={headingId}
          onChange={(event) => {
            setDraft(event.target.value);
            edit.onChanged();
          }}
        />
      ) : (
        <NotesText text={draft} />
      )}
    </section>
  );
}

function NotesText({ text }: { readonly text: string }): React.ReactElement | null {
  if (text.length === 0) return null;
  return <div className="max-h-20 overflow-y-auto break-all whitespace-pre-wrap">{text}</div>;
}
