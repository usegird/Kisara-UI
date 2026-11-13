import { cva } from 'class-variance-authority';
import { ChevronRight, Database, RefreshCw } from 'lucide-react';

import {
  allBackupsOf,
  COMFY_BACKUP,
  GROUPS,
  INDEXED_DB,
  INDEXED_DB_IDS,
  isBrowserEntry,
  membersOf,
  OVERVIEW,
  TOP_IDS,
  type Entry,
} from '@/components/llm/dialogs/storage-entries';
import { markCounts, type Marks } from '@/components/llm/dialogs/storage-marks';
import { BUTTON, RIGHT_MIN } from '@/components/llm/dialogs/storage-style';
import { DecideButton } from '@/components/ui/decide-button';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { PaneDivider } from '@/components/ui/pane-divider';
import { DirectoryToggle } from '@/components/ui/picker-band';
import { t } from '@/i18n';
import { reloadPage } from '@/lib/reload-page';
import { formatBytes } from '@/lib/text';
import { totalOf, type StorageItem } from '@/store/persist/storage-usage';

// ─────────────────────────────
// ストレージの管理の帯と、場所を選ぶ左の列（全体・種類・見出し）。
// 選んでいる場所と印はダイアログが持ち、ここは描いて押したことを返すだけ。
// ─────────────────────────────

/**
 * 左の列の 1 行。選んでいる行は地の色で示す。見出しの左端は全体のアイコンに揃え、全体の下の 4 つと
 * 見出しの下の種類は 1 段字下げする
 */
const entryClass = cva(
  'hover:bg-accent flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-xs',
  {
    variants: {
      active: { true: 'bg-accent', false: '' },
      indent: { true: 'pl-4', false: 'pl-2' },
    },
  },
);

/** 左の列の名前。見出しは太くする */
const navLabel = cva('min-w-0 flex-1 truncate', {
  variants: { heading: { true: 'font-medium', false: '' } },
});

/**
 * 左の列の大きさ。いちばん長い名前（システムテンプレート）が半分ほど隠れる幅（字下げ・大きさ「99.9 KB」を
 * 含めて中身の幅 8.5rem）より狭いときは出さない（幅は左の列の `@container` で決める）
 */
const NAV_SIZE = 'text-muted-foreground shrink-0 text-2xs tabular-nums @max-[8.5rem]:hidden';

/** 帯の props */
export interface StorageBandProps {
  /** 左のまとまりの幅（ピン止めした左の列に揃える。出していなければ無し） */
  readonly leadStyle: React.CSSProperties | undefined;
  readonly applyDisabled: boolean;
  readonly onApply: () => void;
  /** 左の列の出し方（切り替えのアイコン） */
  readonly directory: 'pinned' | 'shown' | 'hidden';
  readonly onDirectory: () => void;
  /** 今の場所の階層 */
  readonly path: readonly { readonly id: string; readonly label: string }[];
  readonly onSelect: (id: string) => void;
  /** 種類ごとの操作（エクスポート・全て削除）。種類を選んでいなければ無し */
  readonly header: React.ReactNode;
  readonly onReload: () => void;
}

/**
 * 帯は全幅の 1 行（Lora を選ぶ画面の帯と同じ形）。左のまとまりは、ピン止めした左の列の幅に揃え、
 * 切り替えの位置を動かさない。幅が足りなければ左のまとまりが中身の幅まで先に縮む
 */
export function StorageBand({
  leadStyle,
  applyDisabled,
  onApply,
  directory,
  onDirectory,
  path,
  onSelect,
  header,
  onReload,
}: StorageBandProps): React.ReactElement {
  return (
    <div className="flex shrink-0 overflow-hidden">
      <div className="min-w-max shrink-0 grow-0" style={leadStyle}>
        <DialogToolbar label={t('llm.storage.leadToolbar')}>
          <DecideButton
            icon="apply"
            caption={t('llm.storage.apply')}
            label={t('llm.storage.apply')}
            title={t('llm.storage.applyHint')}
            disabled={applyDisabled}
            onClick={onApply}
          />
          <DirectoryToggle state={directory} onToggle={onDirectory} />
        </DialogToolbar>
      </div>
      {/* 右の列と同じ下限を持たせ、左のまとまりの右端をピン止めした左の列の右端に揃える */}
      <div className="grow basis-0" style={{ minWidth: RIGHT_MIN }}>
        <DialogToolbar label={t('llm.storage.itemsToolbar')}>
          <Breadcrumb path={path} onSelect={onSelect} />
          {/* 右端に読み直す。全て削除はその左 */}
          <span className="ml-auto" />
          {header}
          <button
            type="button"
            className={`${DIALOG_ICON_CLASS} shrink-0`}
            aria-label={t('llm.storage.reload')}
            title={t('llm.storage.reload')}
            onClick={onReload}
          >
            <RefreshCw className="size-4" aria-hidden />
          </button>
        </DialogToolbar>
      </div>
    </div>
  );
}

/** 一時的に出した左の列。右の列の上（帯の下）に重ね、境目で幅を変える */
export function NavOverlay({
  ref,
  width,
  onResize,
  children,
}: {
  readonly ref: React.Ref<HTMLDivElement>;
  readonly width: number;
  readonly onResize: (next: number) => void;
  /** 左の列 */
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      ref={ref}
      className="bg-popover animate-in slide-in-from-left absolute inset-y-0 left-0 z-30
        flex shadow-lg animation-duration-150 motion-reduce:animate-none"
    >
      <div className="flex min-h-0 flex-col" style={{ width }}>
        {children}
      </div>
      <PaneDivider
        label={t('llm.storage.categories')}
        size={width}
        side="left"
        onResize={onResize}
      />
    </div>
  );
}

/** IndexedDB・ユーザーフォルダを変えたあとの、読み込み直しを勧める行 */
export function ReloadNotice(): React.ReactElement {
  return (
    <div className="bg-muted/60 flex items-center gap-2 border-b px-3 py-1.5">
      <span className="min-w-0 flex-1">{t('llm.storage.pendingReload')}</span>
      <button type="button" className={BUTTON} onClick={reloadPage}>
        {t('llm.storage.reloadPage')}
      </button>
    </div>
  );
}

/** 帯の今の場所。最後（今いる所）以外は押すとそこへ戻る */
function Breadcrumb({
  path,
  onSelect,
}: Pick<StorageBandProps, 'path' | 'onSelect'>): React.ReactElement {
  return (
    <nav aria-label={t('llm.storage.breadcrumb')} className="flex min-w-0 items-center gap-0.5">
      {path.map((crumb, index) => {
        const onCrumbClick = (): void => onSelect(crumb.id);
        return (
          <span key={crumb.id} className="flex min-w-0 items-center gap-0.5">
            {index === 0 ? null : (
              <ChevronRight className="text-muted-foreground size-3 shrink-0" aria-hidden />
            )}
            {index === path.length - 1 ? (
              <span className="truncate font-medium" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground truncate hover:underline"
                onClick={onCrumbClick}
              >
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** 左の列の props */
export interface CategoryNavProps {
  readonly entries: readonly Entry[];
  readonly selected: string;
  readonly marks: Marks;
  readonly onSelect: (id: string) => void;
}

/**
 * 左の列。全体・IndexedDB・localStorage・sessionStorage・Comfy バックアップの下に、目的ごとの見出し
 * （押せる）と種類
 */
export function CategoryNav({
  entries,
  selected,
  marks,
  onSelect,
}: CategoryNavProps): React.ReactElement {
  /**
   * 1 行。名前と大きさの合計を同じ高さに並べる。全体の下の 4 つと見出しの下の種類は字下げする。
   * 中身を読めていない（つないでいないバックアップ）ときは大きさを — にする
   */
  const line = (
    id: string,
    label: string,
    items: readonly StorageItem[] | null,
    options: { readonly indent: boolean; readonly heading: boolean; readonly hint?: string },
  ): React.ReactElement => {
    const onLineClick = (): void => onSelect(id);
    return (
      <button
        key={id}
        type="button"
        className={entryClass({ active: selected === id, indent: options.indent })}
        aria-pressed={selected === id}
        title={options.hint}
        onClick={onLineClick}
      >
        <span className={navLabel({ heading: options.heading })}>{label}</span>
        <MarkCount entry={entries.find((item) => item.id === id)} marks={marks} />
        <span className={NAV_SIZE}>{items === null ? '—' : formatBytes(totalOf(items))}</span>
      </button>
    );
  };
  // ユーザーフォルダの物は、読めていなければ大きさを — にする
  const row = (entry: Entry, indent: boolean): React.ReactElement =>
    line(entry.id, entry.label, entry.remote === null ? entry.items : null, {
      indent,
      heading: false,
      hint: entry.hint,
    });
  const onOverviewClick = (): void => onSelect(OVERVIEW);
  return (
    <nav
      aria-label={t('llm.storage.categories')}
      className="@container min-h-0 flex-1 overflow-y-auto p-1"
    >
      <button
        type="button"
        className={entryClass({ active: selected === OVERVIEW, indent: false })}
        aria-pressed={selected === OVERVIEW}
        onClick={onOverviewClick}
      >
        <Database className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate font-medium">{t('llm.storage.overview')}</span>
      </button>
      {line(
        INDEXED_DB,
        t('llm.storage.indexedDb'),
        membersOf(INDEXED_DB_IDS, entries).flatMap((entry) => entry.items),
        { indent: true, heading: false },
      )}
      {membersOf(TOP_IDS, entries).map((entry) => row(entry, true))}
      {line(COMFY_BACKUP, t('llm.storage.comfyBackup'), allBackupsOf(entries), {
        indent: true,
        heading: false,
      })}
      {GROUPS.map((group) => {
        const members = membersOf(group.ids, entries);
        return (
          <div key={group.id} className="mt-2">
            {/* 見出しの大きさはブラウザの物だけの合計（ユーザーフォルダの物は種類の行にだけ出す） */}
            {line(
              group.id,
              t(group.label),
              members.filter(isBrowserEntry).flatMap((entry) => entry.items),
              {
                indent: false,
                heading: true,
              },
            )}
            {members.map((entry) => row(entry, true))}
          </div>
        );
      })}
    </nav>
  );
}

/** 左の列の種類の行の、印の数（緑の ＋ と赤の −。無ければ出さない） */
function MarkCount({
  entry,
  marks,
}: {
  readonly entry: Entry | undefined;
  readonly marks: Marks;
}): React.ReactElement | null {
  if (entry === undefined) return null;
  const { plus, minus } = markCounts(entry, marks);
  if (plus === 0 && minus === 0) return null;
  return (
    <span className="flex shrink-0 gap-1 text-2xs tabular-nums" aria-hidden>
      {plus === 0 ? null : <span className="text-success">+{plus}</span>}
      {minus === 0 ? null : <span className="text-destructive">−{minus}</span>}
    </span>
  );
}
