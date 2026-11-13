import { Loader2, Save } from 'lucide-react';
import { useId, useState } from 'react';

import { CopyButton } from '@/components/ui/copy-button';
import { InsertIconButton } from '@/components/ui/insert-icon-button';
import { useModelNotes, type ModelNotes as ModelNotesValue } from '@/hooks/flow/use-model-notes';
import { t } from '@/i18n';

// ─────────────────────────────
// モデルの情報の中のメモの欄。選んだモデルの分だけ読み、保存を押したときだけ書く。
// ─────────────────────────────

/** 既定の高さ（`min-h-20`）は、学習で多かった語の並びの高さの上限と揃えてある（`ModelInfoPanel`） */
const FIELD_CLASS =
  'border-input bg-background min-h-20 w-full resize-y rounded-md border px-2 py-1 ' +
  'text-xs leading-snug';

const ICON_BUTTON =
  'text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1 ' +
  'disabled:pointer-events-none disabled:opacity-40';

/** 情報の文字を外の欄へ入れる手続き（差し込みの使い方のときだけ渡る） */
export interface InfoInsert {
  /** 押せない理由（差し込み先が無いなど）。null なら押せる */
  readonly blocked: string | null;
  readonly onInsert: (text: string) => void;
}

/** モデルのメモの欄の props */
export interface ModelNotesProps {
  readonly folder: string;
  /** 選択肢の文字列 */
  readonly filename: string;
  readonly insert?: InfoInsert | undefined;
}

/** メモを読み、読めたら書き換えられる欄を、それまでは読み込み中か失敗の一言を出す */
export function ModelNotes({ folder, filename, insert }: ModelNotesProps): React.ReactElement {
  const notes = useModelNotes(folder, filename);
  const headingId = useId();

  if (notes.status === 'ready') {
    return <NotesEditor notes={notes} saved={notes.text} headingId={headingId} insert={insert} />;
  }
  return (
    <section aria-labelledby={headingId}>
      <NotesHeading id={headingId} />
      <NotesStatus notes={notes} />
    </section>
  );
}

interface NotesHeadingProps {
  readonly id: string;
  /** 見出しの右に置くもの（写し取り・保存） */
  readonly children?: React.ReactNode;
}

function NotesHeading({ id, children }: NotesHeadingProps): React.ReactElement {
  return (
    <div className="mb-1 flex items-center gap-1">
      <h4 id={id} className="text-muted-foreground font-semibold">
        {t('modelPicker.info.notes')}
      </h4>
      {children}
    </div>
  );
}

/** 読み込み中・読めなかったの一言 */
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
  /** 保存済みの中身。ファイルが無ければ null */
  readonly saved: string | null;
  readonly headingId: string;
  readonly insert: InfoInsert | undefined;
}

type SaveState =
  | { readonly kind: 'idle' | 'saving' | 'saved' }
  | { readonly kind: 'failed'; readonly error: string };

/**
 * メモを書き換える欄。打ちかけはこの欄だけの状態なのでここに持つ。別のモデルへ移ったら
 * 呼び出し側が key を変えて作り直し、打ちかけを捨てる
 */
function NotesEditor({ notes, saved, headingId, insert }: NotesEditorProps): React.ReactElement {
  const [draft, setDraft] = useState(saved ?? '');
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const dirty = draft !== (saved ?? '');

  const onSave = async (): Promise<void> => {
    setSaveState({ kind: 'saving' });
    const error = await notes.save(draft);
    setSaveState(error === null ? { kind: 'saved' } : { kind: 'failed', error });
  };

  return (
    <section aria-labelledby={headingId}>
      <NotesHeading id={headingId}>
        <CopyButton iconOnly frameless text={draft} label={t('modelPicker.info.copyNotes')} />
        {insert === undefined ? null : (
          <InsertIconButton
            label={t('modelPicker.info.insertNotes')}
            blocked={insert.blocked}
            empty={draft.trim().length === 0}
            onInsert={() => insert.onInsert(draft.trim())}
          />
        )}
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label={t('modelPicker.info.notesSave')}
          title={t('modelPicker.info.notesSave')}
          disabled={!dirty || saveState.kind === 'saving'}
          onClick={() => void onSave()}
        >
          <Save className="size-3" aria-hidden />
        </button>
        <SaveMessage state={saveState} />
      </NotesHeading>
      <textarea
        className={FIELD_CLASS}
        value={draft}
        aria-labelledby={headingId}
        placeholder={saved === null ? t('modelPicker.info.notesNone') : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          setSaveState({ kind: 'idle' });
        }}
      />
    </section>
  );
}

/** 保存の成否。その場に出す */
function SaveMessage({ state }: { readonly state: SaveState }): React.ReactElement | null {
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
