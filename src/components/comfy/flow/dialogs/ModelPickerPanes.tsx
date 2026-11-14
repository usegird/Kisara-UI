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

/**
 * モデルの情報は選んだときだけ出るので、そのときに読む
 */
const ModelInfoPanel = lazyPart<ModelInfoPanelProps>(
  'modelPicker.info.panel',
  () => import('@/components/comfy/flow/dialogs/ModelInfoPanel').then((m) => m.ModelInfoPanel),
  () => <PartLoading label={t('modelPicker.info.panel')} />,
);

// ─────────────────────────────
// モデルを選ぶダイアログの帯の取り直し・ディレクトリ・格子・情報の置き場。開閉・選択・知らせの状態は
// `ModelPickerDialog` が持ち、ここは描くだけ（帯は PickerBand で、モデルと画像の選択で共通）。
// ─────────────────────────────

/** 格子の余白（`p-3`）。下に重なる物があるときは、その高さに足す */
const GRID_PADDING = 12;

interface RefreshButtonProps {
  readonly folder: string;
  readonly loading: boolean;
  /** 接続先がある。無ければ押せない */
  readonly connected: boolean;
  readonly onRefresh: () => void;
}

/** 一覧の取り直し。読み込んでいる間は回す */
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
      // 同じ種別の取得はストアが 1 本に絞るので、押下の見張りで包まない
      onClick={onRefresh}
    >
      <RefreshCw className={refreshIcon({ loading })} aria-hidden />
    </button>
  );
}

/** ディレクトリの一覧（ピン止めした列と、一時的に重ねたものの中身） */
function ModelDirectories(props: Omit<DirectoryListProps, 'label'>): React.ReactElement {
  return <DirectoryList label={t('modelPicker.directory')} {...props} />;
}

/** ピン止めしたディレクトリ。左の列に置き、境目で幅を変える */
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

/** 一時的に出したディレクトリ。格子の左に重ねる */
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

/** カードの格子の props */
export interface CardGridProps {
  readonly folder: string;
  readonly baseUrl: string;
  /** 一覧をまだ読み込んでいる（カードが 1 枚も無い） */
  readonly loading: boolean;
  readonly visible: readonly ModelItem[];
  /** 少しずつ描く数を先頭から数え直す鍵（絞り込み・並び順） */
  readonly resetKey: string;
  readonly height: number;
  /** 現在の値 */
  readonly value: string;
  readonly selected: string | null;
  readonly onSelect: (value: string, point: Point) => void;
  /** カードの外（隙間・空の所）を押した */
  readonly onClear: () => void;
  /** 末尾に足す余白（下に重ねた情報の高さ）。0 なら足さない */
  readonly bottomInset: number;
  /** 決める。`origin` は押したカードの場所 */
  readonly onPlace: (value: string, origin: DOMRect) => void;
  readonly drag: ModelCardDrag | undefined;
}

/** 中央: カードの格子。何百枚もあるので少しずつ描く */
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
  // 何百枚もあるので少しずつ描く（描く数はこの格子だけが使う）
  const {
    count: shownCount,
    done: shownAll,
    sentinelRef,
  } = useIncrementalList(visible.length, CARD_LIST_STEP, resetKey);
  const columns = `repeat(auto-fill, minmax(${String(cardMinWidth(height))}px, 1fr))`;
  // カードはボタンなので、ボタンの外を押したら選択を外す（キーボードは情報の × で外せる）
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
            const onCardSelect = (picked: ModelItem, point: Point): void =>
              onSelect(picked.value, point);
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

/** 情報を重ねる囲みの props */
export type InfoOverlayProps = Omit<InfoPaneProps, 'onPlace'> & {
  readonly ref: React.Ref<HTMLDivElement>;
  readonly placeMode: 'set' | 'insert';
  /** 取り込み。差し込みの使い方のときだけ出す */
  readonly onPlace: () => void;
};

/** 情報を格子（下なら左の列も含めた全幅）に重ねる囲み */
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
  readonly insert: ModelInfoPanelProps['insert'];
  /** 差し込みのとき、見出しの名前の左の取り込み。閉じずに選んだ値を返す。無ければ出さない */
  readonly onPlace: (() => void) | undefined;
  readonly placeBlocked: string | null;
  /** × は選択を外す */
  readonly onClose: () => void;
}

/**
 * 選んでいるカードの情報。見出しの名前の左に、差し込みなら取り込み（閉じない）を置く。
 * 置き場（右・下）の切り替えは、下なら見出しの × の左、
 * 右なら情報の右下に浮かせる（重ねている囲みの右下。中身と一緒に流れない）
 */
function InfoPane({
  item,
  folder,
  infoKey,
  dock,
  insert,
  onPlace,
  placeBlocked,
  onClose,
}: InfoPaneProps): React.ReactElement {
  const setPaneDock = useSettingsStore((state) => state.setDialogPaneDock);
  // アイコンは移る先を示す
  const toggleLabel = t(
    dock === 'right' ? 'modelPicker.infoDock.bottom' : 'modelPicker.infoDock.right',
  );
  const onDockClick = (): void => setPaneDock(infoKey, dock === 'right' ? 'bottom' : 'right');
  const toggle = (
    <button
      type="button"
      // 見出しの帯の外なので、絵と余白は前の大きさのまま
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
        // 右と下で大きさを分けて残す（幅と高さは別もの）
        paneKey={`${infoKey}:${dock}`}
        label={t('modelPicker.infoPane')}
        side={dock}
        defaultSize={INFO_SIZE[dock]}
      >
        <ModelInfoPanel
          item={item}
          folder={folder}
          layout={dock === 'bottom' ? 'wide' : 'stack'}
          insert={insert}
          leading={
            // 取り込みは名前の左（閉じない）
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
