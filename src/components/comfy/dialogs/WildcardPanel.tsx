import { cva } from 'class-variance-authority';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { acceptInsertTarget } from '@/components/comfy/dialogs/insert-target';
import { InsertButton } from '@/components/comfy/dialogs/InsertButton';
import { arrowSelect } from '@/components/ui/arrow-select';
import { CopyButton } from '@/components/ui/copy-button';
import { PaneCloseButton } from '@/components/ui/decide-button';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { DirectoryList } from '@/components/ui/directory-list';
import { PanelHeader } from '@/components/ui/panel-header';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { SearchField } from '@/components/ui/search-field';
import { SidePane } from '@/components/ui/side-pane';
import { textDragProps } from '@/components/ui/text-drag';
import { wildcardDirectory, wildcardLabel, wildcardPath } from '@/graph/wildcards';
import { useTextFieldWhile } from '@/hooks/flow/use-text-field-focus';
import { t } from '@/i18n';
import { insertAtCaret } from '@/lib/insert-at-caret';
import { directoryTree, isUnderDirectory } from '@/lib/path-tree';
import { guardPress } from '@/lib/press-guard';
import { matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';
import { useSettingsStore } from '@/store/use-settings-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

// ─────────────────────────────
// ワイルドカードの画面の中身。作りはスタイルの編集に揃え、差し込み先の決まりも同じ（`insert-target`）。
// ─────────────────────────────

/** 一覧のワイルドカード 1 つ */
const wildcardItem = cva(
  ['hover:bg-accent flex w-full items-baseline gap-2 rounded px-2 py-1', 'text-left'],
  { variants: { selected: { true: 'bg-accent', false: '' } } },
);

/** ワイルドカードの名前を階層と語で絞り込み、外の入力欄へ差し込む画面 */
export function WildcardPanel(): React.ReactElement | null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const open = useWildcardsStore((state) => state.panelOpen);
  const names = useWildcardsStore((state) => state.names);
  const status = useWildcardsStore((state) => state.status);
  const refresh = useWildcardsStore((state) => state.refresh);
  const close = useWildcardsStore((state) => state.closePanel);

  const [query, setQuery] = useState('');
  const [directory, setDirectory] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const field = useTextFieldWhile(acceptInsertTarget, open);

  const directories = directoryTree(names.map(wildcardDirectory));
  // 左の階層で絞り、語で絞る（前方一致は階層を除いた名前か中身の経路）
  const terms = searchTerms(query);
  const matched = names.filter(
    (name) =>
      isUnderDirectory(wildcardDirectory(name), directory) &&
      matchesAnyTerm(wildcardPath(name), terms),
  );
  const shown = rankBySearch(matched, query, (name) => ({
    names: [wildcardLabel(name), wildcardPath(name)],
    texts: [wildcardPath(name)],
  }));

  if (!open) return null;

  return (
    <>
      {/* 見出しの帯はスタイルの編集と同じ */}
      <PanelHeader
        title={t('wildcards.title')}
        subtitle={selected ?? t('wildcards.pickPrompt')}
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
        {/* 左: 階層の絞り込み */}
        <SidePane
          paneKey="wildcards:left"
          label={t('wildcards.tree')}
          side="left"
          // 左の列の帯: 決定と、右寄せの閉じる ×
          toolbar={
            <DialogToolbar label={t('wildcards.decideToolbar')}>
              <InsertButton text={selected ?? ''} label={t('wildcards.insert')} field={field} />
              <PaneCloseButton label={t('wildcards.close')} onClick={close} />
            </DialogToolbar>
          }
        >
          <DirectoryList
            label={t('wildcards.tree')}
            total={names.length}
            directories={directories}
            selected={directory}
            onSelect={setDirectory}
          />
        </SidePane>

        {/* 右: 帯に左寄せの絞り込み、その下に選んだものと写し取り・一覧 */}
        <div className="flex min-w-0 flex-1 flex-col text-xs">
          <DialogToolbar label={t('wildcards.filterToolbar')}>
            <SearchField
              value={query}
              onChange={setQuery}
              label={t('wildcards.filterLabel')}
              placeholder={t('wildcards.filterPlaceholder')}
            />
          </DialogToolbar>
          {/* 選んだものと写し取り。選ぶまでは行ごと出さない */}
          {selected === null ? null : (
            <div className="flex min-h-7 items-center gap-2 border-b px-3 py-2">
              <code className="bg-muted min-w-0 truncate rounded px-1.5 py-0.5 font-mono">
                {selected}
              </code>
              <CopyButton iconOnly frameless text={selected} label={t('wildcards.copy')} />
            </div>
          )}

          {/* 一覧は `ul` / `li`（role を付けた div より支援技術が確実に読む） */}
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {shown.length === 0 ? (
              <p className="text-muted-foreground p-2">{t('wildcards.noMatch')}</p>
            ) : (
              <ul
                aria-label={t('wildcards.list')}
                onKeyDown={(event) => arrowSelect(event, 'list')}
              >
                {shown.map((name) => (
                  // 掴んで欄へ落とせる（ブラウザの文字のドラッグ）
                  <li key={name} {...textDragProps(name)}>
                    <button
                      type="button"
                      className={wildcardItem({ selected: name === selected })}
                      title={t('wildcards.itemTitle', { name })}
                      aria-label={name}
                      aria-pressed={name === selected}
                      // 押すと焦点はここへ移るが、差し込み先は開いてから最後に入った欄のまま
                      // （既定を止めると掴めなくなる）
                      onClick={() => setSelected(name)}
                      onDoubleClick={() => {
                        if (field !== null) insertAtCaret(field, name);
                      }}
                    >
                      <span className="truncate">{wildcardLabel(name)}</span>
                      {/* 「すべて」で見ているときは、どの階層のものかを薄く添える */}
                      {directory === '' && wildcardDirectory(name) !== '' ? (
                        <span className="text-muted-foreground truncate">
                          {wildcardDirectory(name)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
