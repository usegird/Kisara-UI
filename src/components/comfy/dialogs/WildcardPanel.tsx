import { RefreshCw } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

import { acceptInsertTarget, textAreaOf } from '@/components/comfy/dialogs/insert-target';
import { InsertButton } from '@/components/comfy/dialogs/InsertButton';
import { WildcardList, WildcardPreview } from '@/components/comfy/dialogs/WildcardPanelParts';
import { PaneCloseButton } from '@/components/ui/decide-button';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { PathTreeList } from '@/components/ui/directory-list';
import { InsertCaretMarker, InsertTargetSubtitle } from '@/components/ui/insert-caret-marker';
import { PanelHeader } from '@/components/ui/panel-header';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { SearchField } from '@/components/ui/search-field';
import { SidePane } from '@/components/ui/side-pane';
import { wildcardDirectory, wildcardLabel, wildcardPath } from '@/graph/wildcards';
import { useTextFieldWhile } from '@/hooks/flow/use-text-field-focus';
import { t } from '@/i18n';
import { placeEntry } from '@/lib/insert-motion';
import { directoryTree, isUnderDirectory } from '@/lib/path-tree';
import { guardPress } from '@/lib/press-guard';
import { matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';
import { useSettingsStore } from '@/store/use-settings-store';
import { useWildcardsStore, wildcardEntriesOf } from '@/store/use-wildcards-store';

type RightView = 'list' | 'preview';

export function WildcardPanel(): React.ReactElement | null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const open = useWildcardsStore((state) => state.panelOpen);
  const names = useWildcardsStore((state) => state.names);
  const status = useWildcardsStore((state) => state.status);
  const refresh = useWildcardsStore((state) => state.refresh);
  const close = useWildcardsStore((state) => state.closePanel);
  const ensureEntries = useWildcardsStore((state) => state.ensureEntries);

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [directory, setDirectory] = useState('');
  const [view, setView] = useState<RightView>('list');
  const [selected, setSelected] = useState<string | null>(null);
  const field = useTextFieldWhile(acceptInsertTarget, open);
  const fieldArea = textAreaOf(field);
  const selectedEntries = useWildcardsStore((state) =>
    selected === null ? null : wildcardEntriesOf(state.entries, selected),
  );

  const deferredQuery = useDeferredValue(query);
  const terms = searchTerms(deferredQuery);
  const matched = names.filter((name) => matchesAnyTerm(wildcardPath(name), terms));
  const directories = directoryTree(matched.map(wildcardDirectory));
  const leaves = matched.map((name) => ({ key: name, path: wildcardPath(name) }));
  const listed = rankBySearch(
    matched.filter((name) => isUnderDirectory(wildcardDirectory(name), directory)),
    deferredQuery,
    (name) => ({ names: [wildcardLabel(name), wildcardPath(name)], texts: [wildcardPath(name)] }),
  );

  if (!open) return null;

  const onDirectory = (path: string): void => {
    const next = new Set(expanded);
    if (!next.delete(path)) next.add(path);
    setExpanded(next);
    setDirectory(path);
    setView('list');
  };
  const showAll = (): void => {
    setDirectory('');
    setView('list');
  };
  const select = (name: string): void => {
    setSelected(name);
    setView('preview');
    setExpanded(withAncestors(expanded, wildcardDirectory(name)));
    void ensureEntries(baseUrl, name);
  };
  const place = (name: string, origin: DOMRect): void => {
    if (field !== null) placeEntry(field, name, origin);
  };
  const preview = view === 'preview' ? selected : null;

  return (
    <>
      <PanelHeader
        title={t('wildcards.title')}
        subtitle={
          <InsertTargetSubtitle
            subtitle={selected ?? t('wildcards.pickPrompt')}
            blocked={field === null ? t('insertBar.noTarget') : null}
          />
        }
        onClose={close}
        closeLabel={t('wildcards.close')}
        actions={
          <button
            type="button"
            className={DIALOG_ICON_CLASS}
            aria-label={t('wildcards.refresh')}
            title={t('wildcards.refreshTitle')}
            disabled={baseUrl.length === 0 || status === 'loading'}
            onClick={guardPress('wildcards-refresh', () => void refresh(baseUrl))}
          >
            <RefreshCw className={refreshIcon({ loading: status === 'loading' })} aria-hidden />
          </button>
        }
      />

      <div className="flex min-h-0 flex-1">
        <SidePane
          paneKey="wildcards:left"
          label={t('wildcards.tree')}
          side="left"
          toolbar={
            <DialogToolbar label={t('wildcards.decideToolbar')}>
              <InsertButton
                text={selected ?? ''}
                label={t('wildcards.insert')}
                field={field}
                onPlaced={close}
              />
              {fieldArea === null ? null : <InsertCaretMarker field={fieldArea} />}
              <PaneCloseButton label={t('wildcards.close')} onClick={close} />
            </DialogToolbar>
          }
        >
          {leaves.length === 0 ? (
            <p className="text-muted-foreground p-2 text-xs">{t('wildcards.noMatch')}</p>
          ) : (
            <PathTreeList
              label={t('wildcards.tree')}
              directories={directories}
              leaves={leaves}
              expanded={terms.length > 0 ? 'all' : expanded}
              onToggle={onDirectory}
              all={{
                total: matched.length,
                active: preview === null && directory === '',
                onSelect: showAll,
              }}
              activeDirectory={preview === null && directory !== '' ? directory : null}
              selected={selected}
              onSelect={select}
              onPlace={place}
            />
          )}
        </SidePane>

        <div className="flex min-w-0 flex-1 flex-col text-xs">
          <DialogToolbar label={t('wildcards.filterToolbar')}>
            <SearchField
              value={query}
              onChange={setQuery}
              label={t('wildcards.filterLabel')}
              placeholder={t('wildcards.filterPlaceholder')}
            />
          </DialogToolbar>
          {preview === null ? (
            <WildcardList
              shown={listed}
              directory={directory}
              selected={selected}
              onSelect={select}
              onPlace={place}
            />
          ) : (
            <WildcardPreview
              name={preview}
              entries={selectedEntries}
              insertBlocked={field === null ? t('insertBar.noTarget') : null}
              onInsert={(origin) => {
                if (field !== null) placeEntry(field, preview, origin);
              }}
              onBack={() => setView('list')}
            />
          )}
        </div>
      </div>
    </>
  );
}

function withAncestors(expanded: ReadonlySet<string>, directory: string): ReadonlySet<string> {
  if (directory === '') return expanded;
  const next = new Set(expanded);
  const segments = directory.split('/');
  segments.forEach((_, end) => next.add(segments.slice(0, end + 1).join('/')));
  return next;
}
