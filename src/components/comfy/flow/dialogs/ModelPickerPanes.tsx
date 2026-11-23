import { Loader2, PanelBottom, PanelRight, RefreshCw } from 'lucide-react';

import { INFO_SIZE } from '@/components/comfy/flow/dialogs/model-picker-rules';
import { ModelCard, type ModelCardDrag } from '@/components/comfy/flow/dialogs/ModelCard';
import type { ModelInfoPanelProps } from '@/components/comfy/flow/dialogs/ModelInfoPanel';
import { folderLabel } from '@/components/comfy/flow/model-folder-label';
import { arrowSelect } from '@/components/ui/arrow-select';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { DirectoryList, type DirectoryListProps } from '@/components/ui/directory-list';
import { edgeDockToggle, edgeOverlay } from '@/components/ui/edge-overlay';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { InsertIconButton } from '@/components/ui/insert-icon-button';
import { lazyPart } from '@/components/ui/lazy-part';
import { PartLoading } from '@/components/ui/part-loading';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { SidePane } from '@/components/ui/side-pane';
import type { ModelItem } from '@/graph/model-files';
import { useIncrementalList } from '@/hooks/ui/use-incremental-list';
import { t } from '@/i18n';
import type { Point } from '@/lib/point';
import { cn } from '@/lib/utils';
import { CARD_LIST_STEP, cardMinWidth } from '@/store/settings-fields/card-size';
import { useSettingsStore } from '@/store/use-settings-store';

const ModelInfoPanel = lazyPart<ModelInfoPanelProps>(
  'modelPicker.info.panel',
  () => import('@/components/comfy/flow/dialogs/ModelInfoPanel').then((m) => m.ModelInfoPanel),
  () => <PartLoading label={t('modelPicker.info.panel')} />,
);

const GRID_PADDING = 12;

interface RefreshButtonProps {
  readonly folder: string;
  readonly loading: boolean;
  readonly connected: boolean;
  readonly onRefresh: () => void;
}

export function RefreshButton({
  folder,
  loading,
  connected,
  onRefresh,
}: RefreshButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={DIALOG_ICON_CLASS}
      aria-label={t('modelPicker.refresh.label', { kind: folderLabel(folder) })}
      title={t('modelPicker.refresh.title')}
      disabled={loading || !connected}
      onClick={onRefresh}
    >
      <RefreshCw className={refreshIcon({ loading })} aria-hidden />
    </button>
  );
}

function ModelDirectories(props: Omit<DirectoryListProps, 'label'>): React.ReactElement {
  return <DirectoryList label={t('modelPicker.directory')} {...props} />;
}

export function PinnedDirectories({
  paneKey,
  ...list
}: Omit<DirectoryListProps, 'label'> & { readonly paneKey: string }): React.ReactElement {
  return (
    <SidePane paneKey={paneKey} label={t('modelPicker.directory')} side="left">
      <ModelDirectories {...list} />
    </SidePane>
  );
}

export function DirectoryOverlay({
  ref,
  width,
  ...list
}: Omit<DirectoryListProps, 'label'> & {
  readonly ref: React.Ref<HTMLDivElement>;
  readonly width: number;
}): React.ReactElement {
  return (
    <div
      ref={ref}
      className="bg-popover animate-in slide-in-from-left absolute inset-y-0 left-0 z-30 flex
        border-r shadow-lg animation-duration-150 motion-reduce:animate-none"
      style={{ width }}
    >
      <ModelDirectories {...list} />
    </div>
  );
}

export interface CardGridProps {
  readonly folder: string;
  readonly baseUrl: string;
  readonly loading: boolean;
  readonly visible: readonly ModelItem[];
  readonly resetKey: string;
  readonly height: number;
  readonly value: string;
  readonly selected: string | null;
  readonly onSelect: (value: string, point: Point, box: DOMRect) => void;
  readonly onClear: () => void;
  readonly bottomInset: number;
  readonly onPlace: (value: string, origin: DOMRect) => void;
  readonly drag: ModelCardDrag | undefined;
}

export function CardGrid({
  folder,
  baseUrl,
  loading,
  visible,
  resetKey,
  height,
  value,
  selected,
  onSelect,
  onClear,
  bottomInset,
  onPlace,
  drag,
}: CardGridProps): React.ReactElement {
  const {
    count: shownCount,
    done: shownAll,
    sentinelRef,
  } = useIncrementalList(visible.length, CARD_LIST_STEP, resetKey);
  const columns = `repeat(auto-fill, minmax(${String(cardMinWidth(height))}px, 1fr))`;
  const onGridClick = (event: React.MouseEvent): void => {
    if (event.target instanceof Element && event.target.closest('button') === null) onClear();
  };
  const onGridKeyDown = (event: React.KeyboardEvent<HTMLElement>): void =>
    arrowSelect(event, 'grid');
  let body: React.ReactElement;
  if (loading) {
    body = (
      <p
        className="text-muted-foreground flex items-center justify-center gap-2 p-8 text-sm"
        role="status"
      >
        <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
        {t('modelPicker.grid.loading')}
      </p>
    );
  } else if (visible.length === 0) {
    body = (
      <p className={EMPTY_NOTICE_CLASS}>
        {t('modelPicker.grid.empty', { kind: folderLabel(folder) })}
      </p>
    );
  } else {
    body = (
      <>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: columns }}
          onKeyDown={onGridKeyDown}
        >
          {visible.slice(0, shownCount).map((item) => {
            const onCardSelect = (picked: ModelItem, point: Point, box: DOMRect): void =>
              onSelect(picked.value, point, box);
            const onCardPlace = (picked: ModelItem, origin: DOMRect): void =>
              onPlace(picked.value, origin);
            return (
              <ModelCard
                key={item.value}
                item={item}
                folder={folder}
                baseUrl={baseUrl}
                height={height}
                current={item.value === value}
                selected={item.value === selected}
                onSelect={onCardSelect}
                onPlace={onCardPlace}
                drag={drag}
              />
            );
          })}
        </div>
        {shownAll ? null : (
          <p
            ref={sentinelRef}
            className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-xs"
            role="status"
          >
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
            {t('modelPicker.grid.loadingMore', {
              shown: String(shownCount),
              total: String(visible.length),
            })}
          </p>
        )}
      </>
    );
  }
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto p-3"
      style={bottomInset > 0 ? { paddingBottom: bottomInset + GRID_PADDING } : undefined}
      onClick={onGridClick}
    >
      {body}
    </div>
  );
}

export type InfoOverlayProps = Omit<InfoPaneProps, 'onPlace'> & {
  readonly ref: React.Ref<HTMLDivElement>;
  readonly placeMode: 'set' | 'insert';
  readonly onPlace: () => void;
};

export function InfoOverlay({
  ref,
  placeMode,
  onPlace,
  ...pane
}: InfoOverlayProps): React.ReactElement {
  return (
    <div ref={ref} className={edgeOverlay({ dock: pane.dock })}>
      <InfoPane {...pane} onPlace={placeMode === 'insert' ? onPlace : undefined} />
    </div>
  );
}

interface InfoPaneProps {
  readonly item: ModelInfoPanelProps['item'];
  readonly folder: string;
  readonly infoKey: string;
  readonly dock: 'right' | 'bottom';
  readonly preview: ModelInfoPanelProps['preview'];
  readonly insert: ModelInfoPanelProps['insert'];
  readonly onPlace: (() => void) | undefined;
  readonly placeBlocked: string | null;
  readonly onClose: () => void;
}

function InfoPane({
  item,
  folder,
  infoKey,
  dock,
  preview,
  insert,
  onPlace,
  placeBlocked,
  onClose,
}: InfoPaneProps): React.ReactElement {
  const setPaneDock = useSettingsStore((state) => state.setDialogPaneDock);
  const toggleLabel = t(
    dock === 'right' ? 'modelPicker.infoDock.bottom' : 'modelPicker.infoDock.right',
  );
  const onDockClick = (): void => setPaneDock(infoKey, dock === 'right' ? 'bottom' : 'right');
  const toggle = (
    <button
      type="button"
      className={cn(DIALOG_ICON_CLASS, 'p-1', edgeDockToggle({ dock }))}
      aria-label={toggleLabel}
      title={toggleLabel}
      onClick={onDockClick}
    >
      {dock === 'right' ? (
        <PanelBottom className="size-3.5" aria-hidden />
      ) : (
        <PanelRight className="size-3.5" aria-hidden />
      )}
    </button>
  );
  return (
    <>
      <SidePane
        paneKey={`${infoKey}:${dock}`}
        label={t('modelPicker.infoPane')}
        side={dock}
        defaultSize={INFO_SIZE[dock]}
      >
        <ModelInfoPanel
          item={item}
          folder={folder}
          layout={dock === 'bottom' ? 'wide' : 'stack'}
          preview={preview}
          insert={insert}
          leading={
            onPlace === undefined ? undefined : (
              <InsertIconButton
                label={t('modelPicker.insert.label', { kind: folderLabel(folder) })}
                blocked={placeBlocked}
                onInsert={onPlace}
              />
            )
          }
          actions={dock === 'bottom' ? toggle : undefined}
          onClose={onClose}
        />
      </SidePane>
      {dock === 'right' ? toggle : null}
    </>
  );
}
