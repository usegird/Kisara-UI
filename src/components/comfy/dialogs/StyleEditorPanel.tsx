import { useEffect, useState } from 'react';

import { acceptInsertTarget, textAreaOf } from '@/components/comfy/dialogs/insert-target';
import { InsertButton } from '@/components/comfy/dialogs/InsertButton';
import {
  RefreshStylesButton,
  StyleFooter,
  StyleForm,
  StyleList,
} from '@/components/comfy/dialogs/StyleEditorParts';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PaneCloseButton } from '@/components/ui/decide-button';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { InsertCaretMarker, InsertTargetSubtitle } from '@/components/ui/insert-caret-marker';
import { PanelHeader } from '@/components/ui/panel-header';
import { SearchField } from '@/components/ui/search-field';
import { SidePane } from '@/components/ui/side-pane';
import { emptyStyle, findStyle, type Style } from '@/graph/styles';
import { useTextFieldWhile } from '@/hooks/flow/use-text-field-focus';
import { t, type MessageKey } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';
import { useDialogStore } from '@/store/use-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';
import {
  reportStyleDraft,
  STYLE_EDITOR_DIALOG,
  useStylesStore,
  type StyleSaveFailure,
} from '@/store/use-styles-store';

const WRITE_ERRORS = {
  'empty-name': 'styles.errors.emptyName',
  'duplicate-name': 'styles.errors.duplicateName',
  'not-loaded': 'styles.errors.notLoaded',
} as const satisfies Record<StyleSaveFailure, MessageKey>;

type Editing = ReturnType<typeof useStylesStore.getState>['editing'];

interface PendingMove {
  readonly kind: 'move' | 'close';
  readonly to: string | null;
}

function openedDraft(editing: Editing, initial: Style): Style {
  if (editing?.draft !== undefined) return editing.draft;
  return editing?.prompt === undefined ? initial : { ...initial, prompt: editing.prompt };
}

function sameStyle(a: Style, b: Style): boolean {
  return a.name === b.name && a.prompt === b.prompt && a.negative === b.negative;
}

function confirmingOf(
  pending: PendingMove | null,
  dirty: boolean,
  closeRequested: boolean,
  newStyleRequested: boolean,
): PendingMove | null {
  if (pending !== null) return pending;
  if (!dirty) return null;
  if (closeRequested) return { kind: 'close', to: null };
  return newStyleRequested ? { kind: 'move', to: null } : null;
}

function subtitleOf(selected: string | null, dirty: boolean): string {
  const name = selected ?? t('styles.newStyle');
  return dirty ? `${name} *` : name;
}

export function StyleEditorPanel(): React.ReactElement | null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);

  const editing = useStylesStore((state) => state.editing);
  const table = useStylesStore((state) => state.table);
  const status = useStylesStore((state) => state.status);
  const loaded = useStylesStore(
    (state) => state.loadedFrom !== null && state.loadedFrom === baseUrl,
  );
  const storeError = useStylesStore((state) => state.error);
  const save = useStylesStore((state) => state.save);
  const remove = useStylesStore((state) => state.remove);
  const openEditor = useStylesStore((state) => state.openEditor);
  const closeEditor = useStylesStore((state) => state.closeEditor);

  const selected = editing?.name ?? null;
  const original = findStyle(table, selected);
  const initial = original ?? emptyStyle();
  const opened = openedDraft(editing, initial);

  const [state, setState] = useState({ key: editing, draft: opened });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [deleting, setDeleting] = useState(false);
  const field = useTextFieldWhile(acceptInsertTarget, editing !== null);
  const blocked = field === null ? t('insertBar.noTarget') : null;
  const fieldArea = textAreaOf(field);
  const refresh = useStylesStore((state) => state.refresh);
  const closeRequested = useStylesStore((state) => state.closeRequested);
  const clearCloseRequest = useStylesStore((state) => state.clearCloseRequest);
  const reclaimDialog = useDialogStore((state) => state.reclaim);
  const newStyleRequest = useStylesStore((state) => state.newStyleRequest);
  const clearNewStyleRequest = useStylesStore((state) => state.clearNewStyleRequest);

  const draft = state.key === editing ? state.draft : opened;
  const dirty = !sameStyle(draft, initial);

  useEffect(() => {
    reportStyleDraft(dirty ? draft : null);
    return () => reportStyleDraft(null);
  }, [draft, dirty]);
  useEffect(() => {
    if (closeRequested && !dirty) closeEditor();
  }, [closeRequested, dirty, closeEditor]);
  useEffect(() => {
    if (newStyleRequest === null || dirty) return;
    openEditor(null, newStyleRequest);
    clearNewStyleRequest();
  }, [newStyleRequest, dirty, openEditor, clearNewStyleRequest]);
  const confirming = confirmingOf(pending, dirty, closeRequested, newStyleRequest !== null);

  const [query, setQuery] = useState('');
  const terms = searchTerms(query);
  const matched = table.styles.filter((style) =>
    matchesAnyTerm([style.name, style.prompt, style.negative], terms),
  );
  const shownStyles = rankBySearch(matched, query, (style) => ({
    names: [style.name],
    texts: [style.name, style.prompt, style.negative],
  }));

  if (editing === null) return null;
  if (state.key !== editing) setState({ key: editing, draft: opened });

  const patch = (part: Partial<Style>): void => {
    setError(null);
    setState((current) => ({ ...current, draft: { ...current.draft, ...part } }));
  };

  const request = (kind: 'move' | 'close', to: string | null): void => {
    if (dirty) {
      setPending({ kind, to });
      return;
    }
    if (kind === 'close') closeEditor();
    else openEditor(to);
  };

  const closeAfterInsert = (): void => request('close', null);

  const commit = (): void => {
    void save(baseUrl, original === null ? null : original.name, draft).then((failure) => {
      if (failure !== null) {
        setError(t(WRITE_ERRORS[failure]));
        return;
      }
      setError(null);
      openEditor(draft.name.trim());
    });
  };

  const discard = (): void => {
    if (pending === null && newStyleRequest !== null) {
      openEditor(null, newStyleRequest);
      clearNewStyleRequest();
    } else if (confirming?.kind === 'close') closeEditor();
    else openEditor(confirming?.to ?? null);
    setPending(null);
  };

  const removeSelected = (): void => {
    setDeleting(false);
    if (selected === null) return;

    void remove(baseUrl, selected).then(() => openEditor(null));
  };

  return (
    <>
      <PanelHeader
        title={t('styles.title')}
        subtitle={<InsertTargetSubtitle subtitle={subtitleOf(selected, dirty)} blocked={blocked} />}
        onClose={() => request('close', null)}
        closeLabel={t('styles.close')}
        actions={
          <RefreshStylesButton
            status={status}
            disabled={baseUrl.length === 0}
            onRefresh={guardPress('styles-refresh', () => void refresh(baseUrl))}
          />
        }
      />

      <div className="flex min-h-0 flex-1">
        <SidePane
          paneKey="style-editor:left"
          label={t('styles.list')}
          side="left"
          toolbar={
            <DialogToolbar label={t('styles.insertToolbar')}>
              <InsertButton
                text={draft.prompt}
                caption={t('styles.positive')}
                label={t('styles.insertPositive')}
                field={field}
                onPlaced={closeAfterInsert}
              />
              <InsertButton
                text={draft.negative}
                caption={t('styles.negative')}
                label={t('styles.insertNegative')}
                field={field}
                onPlaced={closeAfterInsert}
              />
              {fieldArea === null ? null : <InsertCaretMarker field={fieldArea} />}
              <PaneCloseButton label={t('styles.close')} onClick={() => request('close', null)} />
            </DialogToolbar>
          }
        >
          <StyleList
            styles={shownStyles}
            selected={selected}
            field={field}
            onPick={(name) => request('move', name)}
          />
        </SidePane>

        <div className="flex min-w-0 flex-1 flex-col">
          <DialogToolbar label={t('styles.filterToolbar')}>
            <SearchField
              value={query}
              onChange={setQuery}
              label={t('styles.filterLabel')}
              placeholder={t('styles.filterPlaceholder')}
            />
          </DialogToolbar>
          <StyleForm draft={draft} onPatch={patch} />
        </div>
      </div>

      <StyleFooter
        message={error ?? storeError}
        saving={status === 'saving'}
        canDelete={original !== null && loaded}
        canSave={loaded}
        onDelete={() => setDeleting(true)}
        onSave={commit}
      />

      <ConfirmDialog
        open={confirming !== null}
        title={t('common.unsaved.title')}
        description={t('common.unsaved.switch')}
        confirmLabel={t('common.ok')}
        onConfirm={discard}
        onCancel={() => {
          setPending(null);
          clearCloseRequest();
          clearNewStyleRequest();
          if (closeRequested) reclaimDialog(STYLE_EDITOR_DIALOG);
        }}
      />

      <ConfirmDialog
        open={deleting}
        title={t('styles.remove.title')}
        description={t('styles.remove.description', { name: selected ?? '' })}
        confirmLabel={t('common.deleteConfirm')}
        onConfirm={removeSelected}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}
