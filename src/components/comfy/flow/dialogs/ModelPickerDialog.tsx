import { useMemo, useRef, useState } from 'react';

import type { ModelPickerDialogProps } from '@/components/comfy/flow/dialogs/model-picker-props';
import {
  bottomInsetOf,
  canDecide,
  cardDragOf,
  closesInfo,
  decideTitleOf,
  failureNotice,
  findModelItem,
  INFO_SIZE,
  insertPropsOf,
  leadWidthOf,
  previewOf,
  selectedCardRectIn,
  selectionOnToggle,
  SORT_LABELS,
} from '@/components/comfy/flow/dialogs/model-picker-rules';
import {
  CardGrid,
  DirectoryOverlay,
  InfoOverlay,
  PinnedDirectories,
  RefreshButton,
} from '@/components/comfy/flow/dialogs/ModelPickerPanes';
import { useInfoReveal } from '@/components/comfy/flow/dialogs/use-info-reveal';
import { folderLabel } from '@/components/comfy/flow/model-folder-label';
import { DialogFrame } from '@/components/ui/dialog';
import { InsertTargetSubtitle } from '@/components/ui/insert-caret-marker';
import { PickerBand } from '@/components/ui/picker-band';
import { usePaneSize } from '@/components/ui/side-pane';
import {
  buildModelItems,
  filterModelItems,
  modelDirectories,
  rankModelItems,
  sortModelItems,
  type ModelSortKey,
} from '@/graph/model-files';
import { useTemporaryPane } from '@/hooks/ui/use-temporary-pane';
import { t } from '@/i18n';
import type { Point } from '@/lib/point';
import { useSettingsStore } from '@/store/use-settings-store';

const PIN_FROM_WIDTH = 800;

export function ModelPickerDialog({
  folder,
  dialogId = 'lora-insert',
  subtitle,
  trigger,
  modal = false,
  placeMode = 'insert',
  placeBlocked = null,
  drag,
  open: openProp,
  onOpenChange,
  finalFocus,
  value,
  options,
  index,
  baseUrl,
  loading,
  onRefresh,
  onInsertText,
  onPlace,
}: ModelPickerDialogProps): React.ReactElement {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean): void => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [query, setQuery] = useState('');
  const [directory, setDirectory] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const {
    pinned,
    shown: directoryShown,
    state: directoryState,
    cycle: cycleDirectory,
    hide: hideDirectory,
    overlay: directoryBox,
    closesOnPointer: directoryClosesOn,
    closesOnKey: directoryClosesOnKey,
    attachFrame,
  } = useTemporaryPane(`${dialogId}:directory`, PIN_FROM_WIDTH);
  const directoryWidth = usePaneSize(`${dialogId}:left`);
  const pickDirectory = (next: string): void => {
    setDirectory(next);
    hideDirectory();
  };

  const infoKey = `${dialogId}:info`;
  const infoDock = useSettingsStore((state) => state.dialogPaneDocks[infoKey] ?? 'right');

  const infoArea = useRef<HTMLDivElement>(null);
  const infoBox = useRef<HTMLDivElement>(null);
  const infoSizes = {
    right: usePaneSize(`${infoKey}:right`, INFO_SIZE.right) + 1,
    bottom: usePaneSize(`${infoKey}:bottom`, INFO_SIZE.bottom) + 1,
  };
  const info = useInfoReveal(infoArea, infoDock, infoSizes[infoDock], value !== '');

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setNotice(null);
    info.reset(value !== '');
    setSelected(selectionOnToggle(open, value, selected));
    hideDirectory();
  }

  const clearSelection = (): void => {
    setSelected(null);
    info.hide();
  };

  const select = (picked: string, point: Point, box: DOMRect): void => {
    if (picked === selected) {
      clearSelection();
      return;
    }
    setSelected(picked);
    info.reveal(picked, point, box);
  };

  const hideInfo = info.hide;

  const place = (
    picked: string,
    origin: DOMRect | null,
    { keepInfo = false, close = false }: { keepInfo?: boolean; close?: boolean } = {},
  ): void => {
    if (!keepInfo) hideInfo();
    if (placeBlocked !== null) return;
    void Promise.resolve(onPlace(picked, origin)).then((error) => {
      setNotice(error);
      if (error === null && (close || placeMode === 'set')) setOpen(false);
    });
  };

  const cardDrag = cardDragOf(drag, setSelected, setNotice);

  const { key: sortKey, ascending } = useSettingsStore((state) => state.modelSort);
  const setModelSort = useSettingsStore((state) => state.setModelSort);
  const kind = folderLabel(folder);
  const height = useSettingsStore((state) => state.modelCardHeight);

  const items = useMemo(() => buildModelItems(options, index), [options, index]);
  const directories = useMemo(() => modelDirectories(items), [items]);
  const directoryList = { total: items.length, directories, selected: directory };
  const selectedItem = useMemo(() => findModelItem(items, selected), [items, selected]);
  const visible = useMemo(
    () =>
      rankModelItems(
        sortModelItems(filterModelItems(items, { directory, query }), sortKey, ascending),
        query,
      ),
    [items, directory, query, sortKey, ascending],
  );

  const infoItem = info.shown ? selectedItem : null;
  const onInfoPlace = (): void => {
    if (infoItem !== null) {
      place(infoItem.value, selectedCardRectIn(infoArea.current), { keepInfo: true });
    }
  };
  const infoPane =
    infoItem === null ? null : (
      <InfoOverlay
        ref={infoBox}
        item={infoItem}
        folder={folder}
        infoKey={infoKey}
        dock={infoDock}
        preview={previewOf(info.coveredCard, infoItem, baseUrl)}
        insert={insertPropsOf(onInsertText, placeBlocked)}
        placeMode={placeMode}
        onPlace={onInfoPlace}
        placeBlocked={placeBlocked}
        onClose={clearSelection}
      />
    );

  const bottomInset = bottomInsetOf(infoItem, infoDock, infoSizes.bottom);

  const onKeyDownCapture = (event: React.KeyboardEvent): void => {
    if (directoryClosesOnKey(event.key)) hideDirectory();
    else if (event.key === 'Escape' && selected !== null) clearSelection();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onPointerDown = (event: React.PointerEvent): void => {
    const closingDirectory = directoryClosesOn(event.target);
    const closingInfo = closesInfo(event.target, infoArea.current, infoBox.current);
    if (closingDirectory) hideDirectory();
    if (closingInfo) hideInfo();
  };
  const onDecide = (): void => {
    if (selectedItem !== null) {
      place(selectedItem.value, selectedCardRectIn(infoArea.current), { close: true });
    }
  };
  const onSort = (key: ModelSortKey, next: boolean): void => setModelSort({ key, ascending: next });
  const onCardPlace = (picked: string, origin: DOMRect): void => {
    setSelected(picked);
    place(picked, origin);
  };

  return (
    <DialogFrame
      id={dialogId}
      movable
      modal={modal}
      open={open}
      onOpenChange={setOpen}
      size="xl"
      finalFocus={finalFocus}
      trigger={trigger}
      title={t('modelPicker.title', { kind })}
      subtitle={<InsertTargetSubtitle subtitle={subtitle} blocked={placeBlocked} />}
      actions={
        <RefreshButton
          folder={folder}
          loading={loading}
          connected={baseUrl.length > 0}
          onRefresh={onRefresh}
        />
      }
    >
      <div
        ref={attachFrame}
        className="flex min-h-0 flex-1 flex-col"
        onKeyDownCapture={onKeyDownCapture}
        onPointerDown={onPointerDown}
      >
        <PickerBand
          decideToolbar={t('modelPicker.decide.toolbar', { kind })}
          decideLabel={t('modelPicker.decide.label', { kind })}
          decideTitle={decideTitleOf(selectedItem, placeBlocked, { mode: placeMode, kind })}
          decideDisabled={!canDecide(selectedItem, placeBlocked)}
          decideIcon={placeMode}
          onDecide={onDecide}
          close={{ label: t('modelPicker.close', { kind }), onClose: () => setOpen(false) }}
          directory={{ state: directoryState, onToggle: cycleDirectory }}
          leadWidth={leadWidthOf(pinned, directoryWidth)}
          filterToolbar={t('modelPicker.filter.toolbar', { kind })}
          filterLabel={t('modelPicker.filter.label', { kind })}
          query={query}
          onQuery={setQuery}
          sortOptions={SORT_LABELS.map((entry) => ({ ...entry, label: t(entry.label) }))}
          sortKey={sortKey}
          ascending={ascending}
          onSort={onSort}
          height={height}
          notice={failureNotice(notice)}
        />

        <div className="relative flex min-h-0 flex-1">
          {pinned ? (
            <PinnedDirectories
              paneKey={`${dialogId}:left`}
              {...directoryList}
              onSelect={setDirectory}
            />
          ) : null}

          <div ref={infoArea} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <CardGrid
              folder={folder}
              baseUrl={baseUrl}
              loading={loading && items.length === 0}
              visible={visible}
              resetKey={[directory, query, sortKey, String(ascending)].join(' ')}
              height={height}
              value={value}
              selected={selected}
              onSelect={select}
              onClear={clearSelection}
              bottomInset={bottomInset}
              onPlace={onCardPlace}
              drag={cardDrag}
            />
            {infoDock === 'right' ? infoPane : null}
          </div>
          {infoDock === 'bottom' ? infoPane : null}

          {directoryShown && !pinned ? (
            <DirectoryOverlay
              ref={directoryBox}
              width={directoryWidth}
              {...directoryList}
              onSelect={pickDirectory}
            />
          ) : null}
        </div>
      </div>
    </DialogFrame>
  );
}
