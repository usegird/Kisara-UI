import { cva } from 'class-variance-authority';
import { Folder, Pin, PinOff } from 'lucide-react';

import { CardHeightField } from '@/components/ui/card-height-field';
import { DecideButton } from '@/components/ui/decide-button';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog-header';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { SearchField } from '@/components/ui/search-field';
import { SortButtons, type SortOption } from '@/components/ui/sort-buttons';
import { t, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// カードで選ぶダイアログの帯（モデルと画像の選択で共通）。描くだけで、状態とストアの購読と
// 文言は呼び出し元が持つ。
// ─────────────────────────────

/** 知らせ。断られた理由は赤、それ以外（名前が変わったなど）はふつうの色 */
const noticeText = cva('min-w-0 truncate', {
  variants: { failed: { true: 'text-destructive', false: 'text-muted-foreground' } },
});

/** ディレクトリの出し方（隠す・一時的に出す・ピン止め） */
type DirectoryToggleState = 'hidden' | 'shown' | 'pinned';

/** 押したときの行き先ごとの絵と名前（隠している → 出す、出している → ピン止め、ピン止め → やめる） */
const DIRECTORY_TOGGLE = {
  hidden: { Icon: Folder, label: 'modelPicker.directoryToggle.show' },
  shown: { Icon: Pin, label: 'modelPicker.directoryToggle.pin' },
  pinned: { Icon: PinOff, label: 'modelPicker.directoryToggle.unpin' },
} as const satisfies Record<string, { readonly Icon: typeof Folder; readonly label: MessageKey }>;

/** 並び替えの種類（共通の部品の形） */
type PickerSortOption<K extends string> = SortOption<K>;

/** カードで選ぶダイアログの帯の props */
export interface PickerBandProps<K extends string> {
  /** 決定のまとまりの読み上げの名前 */
  readonly decideToolbar: string;
  readonly decideLabel: string;
  /** 決定を指したときの説明（押せないときは理由） */
  readonly decideTitle: string;
  readonly decideDisabled: boolean;
  /** `insert` は外の欄へ差し込む、`set` はパラメータへ書く */
  readonly decideIcon: 'set' | 'insert';
  readonly onDecide: () => void;
  /** ディレクトリの切り替え。渡さなければ出さない */
  readonly directory?:
    | {
        readonly state: DirectoryToggleState;
        readonly onToggle: () => void;
      }
    | undefined;
  /** 決定のまとまりの右に置くもの（アップロードなど） */
  readonly actions?: React.ReactNode | undefined;
  /**
   * 左のまとまりの幅（px）。ピン止めした左の列の幅と境目の線を足したもの。
   * 渡すと絞り込みがその位置から始まる。渡さなければ中身の幅
   */
  readonly leadWidth?: number | undefined;
  /** 絞り込みのまとまりの読み上げの名前 */
  readonly filterToolbar: string;
  readonly filterLabel: string;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  /** 並び替えの種類。種類ごとにアイコンを並べ、選んでいるものに向きの三角を出す */
  readonly sortOptions: readonly PickerSortOption<K>[];
  readonly sortKey: K;
  readonly ascending: boolean;
  readonly onSort: (key: K, ascending: boolean) => void;
  readonly height: number;
  /** 知らせ。`failed` は赤で出す。無ければ null */
  readonly notice: { readonly text: string; readonly failed: boolean } | null;
}

/** 決定のまとまりと絞り込みのまとまりを並べた全幅の 1 行 */
export function PickerBand<K extends string>({
  decideToolbar,
  decideLabel,
  decideTitle,
  decideDisabled,
  decideIcon,
  onDecide,
  directory,
  actions,
  leadWidth,
  filterToolbar,
  filterLabel,
  query,
  onQuery,
  sortOptions,
  sortKey,
  ascending,
  onSort,
  height,
  notice,
}: PickerBandProps<K>): React.ReactElement {
  return (
    // 幅が足りないときは、左のまとまりが中身の幅まで先に縮む（右は縮みにくくしてある）
    <div className="flex shrink-0 overflow-hidden">
      <div
        className="min-w-max shrink-0 grow-0"
        style={leadWidth === undefined ? undefined : { flexBasis: leadWidth, flexShrink: 1 }}
      >
        <DialogToolbar label={decideToolbar}>
          {/* 押せない理由は指したときに出す */}
          <DecideButton
            label={decideLabel}
            icon={decideIcon}
            title={decideTitle}
            disabled={decideDisabled}
            onClick={onDecide}
          />
          {directory === undefined ? null : <DirectoryToggle {...directory} />}
          {actions}
        </DialogToolbar>
      </div>
      <div className="min-w-0 shrink-[0.001] grow basis-auto">
        <DialogToolbar label={filterToolbar}>
          <SearchField
            autoFocus
            value={query}
            onChange={onQuery}
            label={filterLabel}
            placeholder={t('modelPicker.filter.placeholder')}
          />
          <SortButtons
            options={sortOptions}
            sortKey={sortKey}
            ascending={ascending}
            onSort={onSort}
          />

          <CardHeightField height={height} />

          {/* 知らせがあるときだけ出す（入れられたふりをしない） */}
          {notice === null ? null : (
            <span className={noticeText({ failed: notice.failed })} title={notice.text}>
              {notice.text}
            </span>
          )}
        </DialogToolbar>
      </div>
    </div>
  );
}

/**
 * ディレクトリの切り替え。絵は押したときの行き先（帯の外でも使う）
 */
export function DirectoryToggle({
  state,
  onToggle,
}: {
  readonly state: DirectoryToggleState;
  readonly onToggle: () => void;
}): React.ReactElement {
  const toggle = DIRECTORY_TOGGLE[state];
  return (
    <button
      type="button"
      data-directory-toggle=""
      // 見出しの帯のアイコンと大きさを揃える
      className={cn(DIALOG_ICON_CLASS, 'shrink-0')}
      aria-label={t(toggle.label)}
      title={t(toggle.label)}
      aria-pressed={state !== 'hidden'}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      <toggle.Icon className="size-4" aria-hidden />
    </button>
  );
}
