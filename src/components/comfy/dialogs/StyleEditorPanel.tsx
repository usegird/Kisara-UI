import { useEffect, useState } from 'react';

import { acceptInsertTarget } from '@/components/comfy/dialogs/insert-target';
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

// ─────────────────────────────
// スタイルの編集の中身。置く場所は呼び出し側が決める（結果画像の重ねと同じ作り）。
// 直しかけはこの画面の中だけに持ち、保存を押したときに表へ書き戻す。
// ─────────────────────────────

const WRITE_ERRORS = {
  'empty-name': 'styles.errors.emptyName',
  'duplicate-name': 'styles.errors.duplicateName',
  'not-loaded': 'styles.errors.notLoaded',
} as const satisfies Record<StyleSaveFailure, MessageKey>;

type Editing = ReturnType<typeof useStylesStore.getState>['editing'];

/** 確かめている移り先。閉じるか、別のスタイル（null は新規）へ */
interface PendingMove {
  readonly kind: 'move' | 'close';
  readonly to: string | null;
}

/**
 * 開いたときの文面。タブを切り替えて戻ったときは控えた直しかけ、
 * アプリ入力から送られた文面は新規の肯定に入れておく
 */
function openedDraft(editing: Editing, initial: Style): Style {
  if (editing?.draft !== undefined) return editing.draft;
  return editing?.prompt === undefined ? initial : { ...initial, prompt: editing.prompt };
}

function sameStyle(a: Style, b: Style): boolean {
  return a.name === b.name && a.prompt === b.prompt && a.negative === b.negative;
}

/**
 * 捨てる前に確かめる移り先。自分の操作で頼んだもの、外から閉じるよう頼まれたもの、
 * アプリ入力から文面が送られたものの順。直しかけが無ければ確かめない
 */
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

/** 見出しの補足。開いている名前（新規はその旨）、直しかけなら印を付ける */
function subtitleOf(selected: string | null, dirty: boolean): string {
  const name = selected ?? t('styles.newStyle');
  return dirty ? `${name} *` : name;
}

/**
 * スタイルを選んで直し、外の入力欄へ差し込む画面。捨てることになる操作（別のスタイルへ移る・閉じる・
 * 消す）の前には必ず確かめる。
 */
export function StyleEditorPanel(): React.ReactElement | null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);

  const editing = useStylesStore((state) => state.editing);
  const table = useStylesStore((state) => state.table);
  const status = useStylesStore((state) => state.status);
  // 読み終えた接続先にだけ書ける（読めていない一覧で書くと styles.csv の行を隠す）
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

  // 開き直したら描画中に入れ替える（副作用にすると 1 回余計に描く）
  const [state, setState] = useState({ key: editing, draft: opened });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [deleting, setDeleting] = useState(false);
  const field = useTextFieldWhile(acceptInsertTarget, editing !== null);
  const refresh = useStylesStore((state) => state.refresh);
  const closeRequested = useStylesStore((state) => state.closeRequested);
  const clearCloseRequest = useStylesStore((state) => state.clearCloseRequest);
  const reclaimDialog = useDialogStore((state) => state.reclaim);
  const newStyleRequest = useStylesStore((state) => state.newStyleRequest);
  const clearNewStyleRequest = useStylesStore((state) => state.clearNewStyleRequest);

  const draft = state.key === editing ? state.draft : opened;
  const dirty = !sameStyle(draft, initial);

  // 直しかけをストアへ知らせる（タブを切り替えるときに控える）
  useEffect(() => {
    reportStyleDraft(dirty ? draft : null);
    return () => reportStyleDraft(null);
  }, [draft, dirty]);
  // アイコンの押し直し（外の操作）で閉じるよう頼まれた。直しかけが無ければそのまま閉じ、
  // あれば下の確かめを出す（頼まれた印は閉じるか、やめるまで残す）
  useEffect(() => {
    if (closeRequested && !dirty) closeEditor();
  }, [closeRequested, dirty, closeEditor]);
  // アプリ入力から文面が送られた。直しかけが無ければそのまま新規として開き直し、あれば確かめる
  useEffect(() => {
    if (newStyleRequest === null || dirty) return;
    openEditor(null, newStyleRequest);
    clearNewStyleRequest();
  }, [newStyleRequest, dirty, openEditor, clearNewStyleRequest]);
  const confirming = confirmingOf(pending, dirty, closeRequested, newStyleRequest !== null);

  // 一覧の絞り込み（前方一致は名前、語は名前と文面から探す）
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

  /** 直しかけを捨てることになるときだけ確かめてから移る */
  const request = (kind: 'move' | 'close', to: string | null): void => {
    if (dirty) {
      setPending({ kind, to });
      return;
    }
    if (kind === 'close') closeEditor();
    else openEditor(to);
  };

  const commit = (): void => {
    void save(baseUrl, original === null ? null : original.name, draft).then((failure) => {
      if (failure !== null) {
        setError(t(WRITE_ERRORS[failure]));
        return;
      }
      setError(null);
      // 新規は保存した名前で開き直す（続けて直せるように）
      openEditor(draft.name.trim());
    });
  };

  /** 確かめたうえで捨てて移る（閉じる・別のスタイルへ） */
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
      {/* 見出しの帯はダイアログと同じ */}
      <PanelHeader
        title={t('styles.title')}
        subtitle={subtitleOf(selected, dirty)}
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
        {/* 左: 選ぶ一覧。新規は絞り込みに拠らず先頭 */}
        <SidePane
          paneKey="style-editor:left"
          label={t('styles.list')}
          side="left"
          // 左の列の帯: 肯定・否定の文面をそれぞれ差し込む、右寄せの閉じる ×
          toolbar={
            <DialogToolbar label={t('styles.insertToolbar')}>
              <InsertButton
                text={draft.prompt}
                caption={t('styles.positive')}
                label={t('styles.insertPositive')}
                field={field}
              />
              <InsertButton
                text={draft.negative}
                caption={t('styles.negative')}
                label={t('styles.insertNegative')}
                field={field}
              />
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

        {/* 右: 帯に左寄せの一覧の絞り込み、その下で直す */}
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

      {/* 直しかけを捨てる前に確かめる */}
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
          // ほかの埋め込みが開いて閉じるよう頼まれていたなら、スタイルに留まる（開いた方を閉じる）
          if (closeRequested) reclaimDialog(STYLE_EDITOR_DIALOG);
        }}
      />

      {/* 消すのは戻せない */}
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
