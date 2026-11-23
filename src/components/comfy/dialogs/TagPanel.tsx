import { RefreshCw } from 'lucide-react';

import { PysssssTagTable } from '@/components/comfy/dialogs/PysssssTagTable';
import { DictionaryList, type TagView } from '@/components/comfy/dialogs/TagDictionaryList';
import { EditableTagTable, ReadOnlyTagTable } from '@/components/comfy/dialogs/TagPanelParts';
import { useTagPanel } from '@/components/comfy/dialogs/use-tag-panel';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DecideButton, PaneCloseButton } from '@/components/ui/decide-button';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { PanelHeader } from '@/components/ui/panel-header';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { SearchField } from '@/components/ui/search-field';
import { SidePane } from '@/components/ui/side-pane';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';

type Panel = ReturnType<typeof useTagPanel>;

export function TagPanel(): React.ReactElement {
  const panel = useTagPanel();
  const { store, draft } = panel;
  const busy = store.status === 'loading' || store.status === 'saving';
  const canConfirm = panel.dirty && store.loaded && !busy;

  return (
    <>
      <PanelHeader
        title={t('tags.title')}
        subtitle={panel.dirty ? `${viewLabel(draft.view)} *` : viewLabel(draft.view)}
        onClose={panel.requestClose}
        closeLabel={t('tags.close')}
        actions={
          <button
            type="button"
            className={DIALOG_ICON_CLASS}
            aria-label={t('tags.refresh')}
            title={t('tags.refreshTitle')}
            disabled={panel.baseUrl.length === 0 || busy}
            onClick={guardPress('tags-refresh', panel.refresh)}
          >
            <RefreshCw
              className={refreshIcon({ loading: store.status === 'loading' })}
              aria-hidden
            />
          </button>
        }
      />

      <div className="flex min-h-0 flex-1">
        <SidePane
          paneKey="tag-panel:left"
          label={t('tags.dictionaries')}
          side="left"
          toolbar={
            <DialogToolbar label={t('tags.confirmToolbar')}>
              <DecideButton
                label={t('tags.confirmLabel')}
                caption={t('tags.confirm')}
                title={t(canConfirm ? 'tags.confirmTitle' : 'tags.confirmIdleTitle')}
                icon="apply"
                disabled={!canConfirm}
                onClick={guardPress('tags-confirm', panel.confirm)}
              />
              <PaneCloseButton label={t('tags.close')} onClick={panel.requestClose} />
            </DialogToolbar>
          }
        >
          <DictionaryList
            view={draft.view}
            totals={{
              all: store.merged.length,
              pysssss: store.pysssss === null ? null : store.pysssss.length,
            }}
            dictionaries={draft.dictionaries}
            canWrite={store.loaded && !busy}
            onSelect={panel.selectView}
            onToggle={panel.toggleDictionary}
            onAdd={panel.addDictionary}
          />
        </SidePane>

        <div className="flex min-w-0 flex-1 flex-col">
          <DialogToolbar label={t('tags.filterToolbar')}>
            <SearchField
              value={panel.query}
              onChange={panel.setQuery}
              label={t('tags.filterLabel')}
              placeholder={t('tags.filterPlaceholder')}
            />
          </DialogToolbar>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <TagTableArea panel={panel} />
          </div>
          {(panel.error ?? store.error) === null ? null : (
            <p className="text-destructive border-t px-3 py-1.5 text-xs">
              {panel.error ?? store.error}
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={panel.confirming}
        title={t('common.unsaved.title')}
        description={t('common.unsaved.close')}
        confirmLabel={t('common.ok')}
        onConfirm={panel.discard}
        onCancel={panel.cancelDiscard}
      />
    </>
  );
}

function TagTableArea({ panel }: { readonly panel: Panel }): React.ReactElement {
  const { editable, readOnly, pysssss, draft, sort, changeSort } = panel;
  const table = editable ?? readOnly ?? pysssss;
  const shown = table?.rows.length ?? 0;
  const total = table?.total ?? 0;
  return (
    <>
      {editable !== null ? (
        <EditableTagTable
          rows={editable.rows}
          blank={draft.blank}
          onChange={panel.changeRow}
          onToggle={panel.toggleRow}
          sort={sort}
          onSort={changeSort}
        />
      ) : pysssss !== null ? (
        <PysssssTagTable
          rows={pysssss.rows}
          onChange={panel.changePysssssRow}
          sort={sort}
          onSort={changeSort}
        />
      ) : (
        <ReadOnlyTagTable rows={readOnly?.rows ?? []} sort={sort} onSort={changeSort} />
      )}
      {total > shown ? (
        <p className="text-muted-foreground p-2 text-xs">
          {t('tags.more', { count: total - shown })}
        </p>
      ) : null}
    </>
  );
}

function viewLabel(view: TagView): string {
  if (view.kind === 'dictionary') return view.name;
  return t(view.kind === 'pysssss' ? 'tags.pysssss' : 'tags.all');
}
