import { useEffect, useMemo, useRef, useState } from 'react';

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
import { folderLabel } from '@/components/comfy/flow/model-folder-label';
import { DialogFrame } from '@/components/ui/dialog';
import { EDGE_OVERLAY_DELAY, edgeOverlayCoversPoint } from '@/components/ui/edge-overlay';
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

// ─────────────────────────────
// モデルを選ぶダイアログ。種別を問わず同じ画面で選び、選んだ値を呼び出し元へ返す。
// 呼び出し元の部品・ストアは知らず、受け取るのは値と手続きだけ。
// ─────────────────────────────

/**
 * 一度もピン止めを切り替えていないとき、ディレクトリをピン止めで出す枠の幅（px）
 */
const PIN_FROM_WIDTH = 800;

/** モデルの一覧をディレクトリ・カードの格子・情報の列で見せ、選んだ値を `onPlace` へ返す */
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
  decideAside,
}: ModelPickerDialogProps): React.ReactElement {
  // 開け閉ては基盤の Trigger に任せ、こちらで押下から状態を作らない（a11y の部品を自作しない）。
  // 呼び出し元が `open` を渡したときだけ、開け閉てをそちらに任せる
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean): void => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [query, setQuery] = useState('');
  const [directory, setDirectory] = useState('');
  // 選んでいるカード（選択肢の文字列）。開いたときはいまの値
  const [selected, setSelected] = useState<string | null>(null);
  // 決定・掴むのを断られたときの理由
  const [notice, setNotice] = useState<string | null>(null);
  // 情報を出しているか。カードを押すと少し待って出し、決定・ダブルクリックで隠す
  const [infoShown, setInfoShown] = useState(value !== '');
  const infoTimer = useRef<number | null>(null);
  const cancelInfo = (): void => {
    if (infoTimer.current !== null) window.clearTimeout(infoTimer.current);
    infoTimer.current = null;
  };
  useEffect(() => cancelInfo, []);
  // ディレクトリ（左の列）。ピン止めは呼び出し元ごとに端末に残す
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

  // 開いた瞬間に、いまの値のカードを選んだ状態へ戻す（描画中に前回から直す React の型）。
  // 開け閉てを呼び出し元が持つときは基盤から開く知らせが来ないので、ここで拾う
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setNotice(null);
    setInfoShown(value !== '');
    setSelected(selectionOnToggle(open, value, selected));
    hideDirectory();
  }

  // 情報の置き場（右・下）は呼び出し元ごとに残す
  const infoKey = `${dialogId}:info`;
  const infoDock = useSettingsStore((state) => state.dialogPaneDocks[infoKey] ?? 'right');

  /** カードの外か、選んでいるカードを押した。選択を外し、出しかけの情報も止める */
  const clearSelection = (): void => {
    cancelInfo();
    setSelected(null);
    setInfoShown(false);
  };

  // 情報を重ねる囲み（格子の範囲）と、置き場ごとの情報の大きさ（境目の線を含める）。
  // 下に置いた情報は格子の外（左の列の上）にも出るので、押した所の判定に情報そのものも見る
  const infoArea = useRef<HTMLDivElement>(null);
  const infoBox = useRef<HTMLDivElement>(null);
  const infoSizes = {
    right: usePaneSize(`${infoKey}:right`, INFO_SIZE.right) + 1,
    bottom: usePaneSize(`${infoKey}:bottom`, INFO_SIZE.bottom) + 1,
  };

  const select = (picked: string, point: Point): void => {
    // 選んでいるカードを押し直したら外す
    if (picked === selected) {
      clearSelection();
      return;
    }
    setSelected(picked);
    if (infoShown) return;
    cancelInfo();
    if (!edgeOverlayCoversPoint(infoArea.current, infoDock, infoSizes[infoDock], point)) {
      setInfoShown(true);
      return;
    }
    infoTimer.current = window.setTimeout(() => {
      infoTimer.current = null;
      setInfoShown(true);
    }, EDGE_OVERLAY_DELAY);
  };

  /** 格子と情報の外を押した。情報だけ隠す（選んだまま） */
  const hideInfo = (): void => {
    cancelInfo();
    setInfoShown(false);
  };

  /**
   * 選んだ値を呼び出し元へ返す。使えなければ理由を出す。閉じるのはパラメータへ書いたときだけで、
   * 差し込みは続けて選べるように開いたままにする。取り込み（`keepInfo`）は情報も出したままにする
   */
  const place = (picked: string, origin: DOMRect | null, keepInfo = false): void => {
    if (!keepInfo) hideInfo();
    // 押せない理由は見出しに出しているので、帯には重ねて出さない
    if (placeBlocked !== null) return;
    void Promise.resolve(onPlace(picked, origin)).then((error) => {
      setNotice(error);
      if (error === null && placeMode === 'set') setOpen(false);
    });
  };

  const cardDrag = cardDragOf(drag, setSelected, setNotice);

  // 並び替えとカードの高さは端末に残し、どの選択肢から開いても同じにする
  const { key: sortKey, ascending } = useSettingsStore((state) => state.modelSort);
  const setModelSort = useSettingsStore((state) => state.setModelSort);
  const kind = folderLabel(folder);
  const height = useSettingsStore((state) => state.modelCardHeight);

  // この部品では compiler が一覧を前回の物にしない（外すと描くたびに組み直す）ので、手で書く
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

  const infoItem = infoShown ? selectedItem : null;
  const onInfoPlace = (): void => {
    if (infoItem !== null) place(infoItem.value, selectedCardRectIn(infoArea.current), true);
  };
  const infoPane =
    infoItem === null ? null : (
      <InfoOverlay
        ref={infoBox}
        item={infoItem}
        folder={folder}
        infoKey={infoKey}
        dock={infoDock}
        insert={insertPropsOf(onInsertText, placeBlocked)}
        placeMode={placeMode}
        onPlace={onInfoPlace}
        placeBlocked={placeBlocked}
        onClose={clearSelection}
      />
    );

  // 下に重ねている間は、同じ高さ（と境目の線）だけ格子の末尾を伸ばし、最後のカードを隠さない
  const bottomInset = bottomInsetOf(infoItem, infoDock, infoSizes.bottom);

  // Esc は一時的なディレクトリ → 選んだカード → ダイアログの順に閉じる
  const onKeyDownCapture = (event: React.KeyboardEvent): void => {
    if (directoryClosesOnKey(event.key)) hideDirectory();
    else if (event.key === 'Escape' && selected !== null) clearSelection();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  // 一時的に出したディレクトリはその外（切り替えのアイコンを除く）、情報は格子と情報の外を押したら閉じる
  const onPointerDown = (event: React.PointerEvent): void => {
    const closingDirectory = directoryClosesOn(event.target);
    const closingInfo = closesInfo(event.target, infoArea.current, infoBox.current);
    if (closingDirectory) hideDirectory();
    if (closingInfo) hideInfo();
  };
  const onDecide = (): void => {
    if (selectedItem !== null) place(selectedItem.value, selectedCardRectIn(infoArea.current));
  };
  const onSort = (key: ModelSortKey, next: boolean): void => setModelSort({ key, ascending: next });
  const onCardPlace = (picked: string, origin: DOMRect): void => {
    setSelected(picked);
    place(picked, origin);
  };

  return (
    <DialogFrame
      // 枠の出し方・位置・大きさは種別を問わず 1 つ（呼び出し元ごとには分ける）
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
        // 右端: 取り直し、その右に閉じる（枠が置く）
        <RefreshButton
          folder={folder}
          loading={loading}
          connected={baseUrl.length > 0}
          onRefresh={onRefresh}
        />
      }
    >
      {/* 格子と情報の外（帯・ディレクトリ）を押したら情報を隠す。列の境目は大きさを変えるだけ */}
      <div
        ref={attachFrame}
        className="flex min-h-0 flex-1 flex-col"
        onKeyDownCapture={onKeyDownCapture}
        onPointerDown={onPointerDown}
      >
        {/* 帯は全幅の 1 行。左の列の幅を変えても動かない */}
        <PickerBand
          decideToolbar={t('modelPicker.decide.toolbar', { kind })}
          decideLabel={t('modelPicker.decide.label', { kind })}
          decideTitle={decideTitleOf(selectedItem, placeBlocked)}
          decideDisabled={!canDecide(selectedItem, placeBlocked)}
          decideIcon={placeMode}
          onDecide={onDecide}
          decideAside={decideAside}
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
          {/* 左: ピン止めしたディレクトリ（件数はその下すべてを合わせたもの） */}
          {pinned ? (
            <PinnedDirectories
              paneKey={`${dialogId}:left`}
              {...directoryList}
              onSelect={setDirectory}
            />
          ) : null}

          {/* 中央: カードの格子。画面が広いほど横に並ぶ枚数が増える。情報はその上に重ねる */}
          <div ref={infoArea} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <CardGrid
              folder={folder}
              baseUrl={baseUrl}
              loading={loading && items.length === 0}
              visible={visible}
              // 絞り込みか並び順が変わったら先頭から数え直す
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

          {/* 一時的に出したディレクトリ。格子の左に重ね、選ぶか外を押すと閉じる */}
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
