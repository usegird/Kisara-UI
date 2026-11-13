import { useEffect, useState } from 'react';

import {
  applyMarks,
  openStorageFile,
  takeEntryBackup,
  toastApplied,
} from '@/components/llm/dialogs/storage-actions';
import {
  buildEntries,
  COMFY_BACKUP,
  OVERVIEW,
  pathOf,
  type BackupLists,
  type Entry,
  type OpenedFile,
  type UserFileLists,
} from '@/components/llm/dialogs/storage-entries';
import {
  toggleMarks,
  withoutReferenceMarks,
  type Mark,
  type Marks,
} from '@/components/llm/dialogs/storage-marks';
import { RIGHT_MIN } from '@/components/llm/dialogs/storage-style';
import { BackupOverview } from '@/components/llm/dialogs/StorageBackupOverview';
import { EntryHeader, ItemList } from '@/components/llm/dialogs/StorageItemList';
import {
  CategoryNav,
  NavOverlay,
  ReloadNotice,
  StorageBand,
} from '@/components/llm/dialogs/StorageNav';
import { Overview } from '@/components/llm/dialogs/StorageOverview';
import { DialogFrame } from '@/components/ui/dialog';
import { clampPane, SidePane, usePaneSize } from '@/components/ui/side-pane';
import { useTemporaryPane } from '@/hooks/ui/use-temporary-pane';
import { t } from '@/i18n';
import { DIALOG_MIN } from '@/lib/dialog-rect';
import { guardPress } from '@/lib/press-guard';
import { reloadPage } from '@/lib/reload-page';
import { BACKUP_KINDS, listBackups } from '@/store/persist/storage-backups';
import {
  listUserFileItems,
  readStorageUsage,
  USER_FILE_KINDS,
  type StorageUsage,
} from '@/store/persist/storage-usage';
import { useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore } from '@/store/use-settings-store';
import type { StorageDialogStart } from '@/store/use-storage-dialog-store';

// ─────────────────────────────
// ストレージの管理のダイアログ。読んだ結果と印は開いている間だけ持つ。会話のタブから開くので、
// いつも自由移動で出す。
// ─────────────────────────────

const DIALOG_ID = 'llm-storage';
const PANE_KEY = `${DIALOG_ID}:left`;
const PIN_KEY = `${DIALOG_ID}:directory`;
/**
 * 左の列を広げられる上限。いちばん長い名前（システムテンプレート）に大きさ「999 KB」を並べた長さ
 * （名前 119px・大きさ 37px と字下げ・余白）。既定の幅も同じにする
 */
const LEFT_MAX = 194;
const LEFT_WIDTH = LEFT_MAX;
/** 左の列を縮められる下限（左右の列の部品と同じ）。ダイアログを狭めると、ここまで先に縮む */
const LEFT_MIN = 140;
/**
 * 境目の線とダイアログの枠の幅
 */
const FRAME_EXTRA = 4;
/** ダイアログの最小。左の列を下限まで縮めて、右の列を横に送らずに済む幅 */
const STORAGE_DIALOG_MIN = {
  width: LEFT_MIN + RIGHT_MIN + FRAME_EXTRA,
  height: DIALOG_MIN.height,
};

/** ストレージの管理のダイアログの props */
export interface StorageDialogProps {
  readonly open: boolean;
  /** 開いたときに出す場所（古いバックアップの知らせからは Comfy バックアップ） */
  readonly start?: StorageDialogStart;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * 左の列で場所（全体・見出し・種類）を選び、右に中身を出すダイアログ。削除は印を付けるだけで、
 * 「適用」でまとめて消す
 */
export function StorageDialog({
  open,
  start = 'overview',
  onOpenChange,
}: StorageDialogProps): React.ReactElement {
  return (
    <DialogFrame
      id={DIALOG_ID}
      // 左右の列を並べ、右の一覧を中で送るので、高さの決まった大きさにする
      size="lg"
      minSize={STORAGE_DIALOG_MIN}
      movable
      modal={false}
      // 会話のタブには嵌める列が無いので、いつも自由移動で出す
      embeddable={false}
      open={open}
      onOpenChange={onOpenChange}
      title={t('llm.storage.title')}
    >
      {/* 開くたびに全体・読み直した中身・印の無い状態から始めたいので、中身は開いている間だけ置く */}
      {open ? <StorageBody start={start === 'comfyBackup' ? COMFY_BACKUP : OVERVIEW} /> : null}
    </DialogFrame>
  );
}

function StorageBody({ start }: { readonly start: string }): React.ReactElement {
  const connected = useConnectionStore((state) => state.status === 'connected');
  const {
    pinned,
    shown,
    state: directoryState,
    cycle,
    hide,
    overlay,
    closesOnPointer,
    closesOnKey,
  } = useTemporaryPane(PIN_KEY);
  const setPaneWidth = useSettingsStore((state) => state.setDialogPaneWidth);
  const leftWidth = usePaneSize(PANE_KEY, LEFT_WIDTH, LEFT_MIN, LEFT_MAX);
  const [revision, setRevision] = useState(0);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [backups, setBackups] = useState<BackupLists | null>(null);
  const [userFiles, setUserFiles] = useState<UserFileLists | null>(null);
  const [selected, setSelected] = useState(start);
  const [marks, setMarks] = useState<Marks>(new Map());
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  // 開いたエクスポートのファイル（種類ごと）。中身はダイアログを閉じると捨てる
  const [files, setFiles] = useState<ReadonlyMap<string, OpenedFile>>(new Map());
  const refresh = (): void => setRevision((value) => value + 1);

  // 保存領域は外のもの。開いたときと読み直すときに読む
  useEffect(() => {
    let alive = true;
    void readStorageUsage().then((found) => {
      if (alive) setUsage(found);
    });
    return () => {
      alive = false;
    };
  }, [revision]);

  // 控えは接続先のもの。つないでいる間に、開いたときと読み直すときに読む
  useEffect(() => {
    if (!connected) return undefined;
    let alive = true;
    void Promise.all(
      BACKUP_KINDS.map(async (kind) => {
        const items = await listBackups(kind).catch(() => 'failed' as const);
        return [kind, items ?? 'failed'] as const;
      }),
    ).then((entries) => {
      if (alive) setBackups(Object.fromEntries(entries));
    });
    // ユーザーフォルダの物も同じ時機に読む
    void Promise.all(
      USER_FILE_KINDS.map(async (kind) => {
        const items = await listUserFileItems(kind).catch(() => 'failed' as const);
        return [kind, items ?? 'failed'] as const;
      }),
    ).then((entries) => {
      if (alive) setUserFiles(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [connected, revision]);

  const entries = buildEntries({ usage, connected, backups, userFiles, files });
  const entry = entries.find((item) => item.id === selected);

  const choose = (id: string): void => {
    setSelected(id);
    hide();
  };
  const toggle = (targets: readonly Mark[]): void => {
    setMarks((current) => toggleMarks(current, targets));
  };
  const toggleOne = (mark: Mark): void => toggle([mark]);
  const dropReferenceMarks = (entryId: string): void => {
    setMarks((current) => withoutReferenceMarks(current, entryId));
  };

  /** エクスポートのファイルを開き、その種類のバックアップの列に替える */
  const openFile = async (target: Entry, picked: File): Promise<void> => {
    const file = await openStorageFile(target, picked);
    if (file === null) return;
    setFiles((current) => new Map(current).set(target.id, file));
    dropReferenceMarks(target.id);
  };

  const closeFile = (entryId: string): void => {
    setFiles((current) => {
      const next = new Map(current);
      next.delete(entryId);
      return next;
    });
    dropReferenceMarks(entryId);
  };

  /**
   * 印を付けた物をまとめて行う。戻すを先に行い（戻した数を 1 回知らせる）、続けて消す。
   * localStorage を消したら・sessionStorage に戻したら、終えてから読み込み直す
   */
  const apply = async (): Promise<void> => {
    setBusy(true);
    const outcome = await applyMarks(
      [...marks.values()],
      new Map(entries.map((item) => [item.id, item])),
    );
    setBusy(false);
    setMarks(new Map());
    toastApplied(outcome);
    // localStorage・sessionStorage は画面の中の値がすぐ書き戻すので読み込み直す
    if (outcome.local) {
      reloadPage();
      return;
    }
    if (outcome.indexedDb) setReloadNeeded(true);
    refresh();
  };

  /** 控えの無い 1 件のバックアップをその場で取る。取れたら一覧を読み直す */
  const take = async (target: Entry, key: string): Promise<void> => {
    if (await takeEntryBackup(target, key)) refresh();
  };

  // 一時的に出した左の列は、その外（切り替えのアイコンを除く）を押すか Esc で閉じる
  const onKeyDownCapture = (event: React.KeyboardEvent): void => {
    if (!closesOnKey(event.key)) return;
    hide();
    event.preventDefault();
    event.stopPropagation();
  };
  const onPointerDown = (event: React.PointerEvent): void => {
    if (closesOnPointer(event.target)) hide();
  };
  const onApplyClick = guardPress('storage-apply', () => void apply());
  const onPaneResize = (next: number): void =>
    setPaneWidth(PANE_KEY, clampPane(next, LEFT_MIN, LEFT_MAX));

  /** 右の列の中身。読んでいる間はその旨、種類なら 1 件ずつ、ほかは合計の表 */
  const content = (): React.ReactElement => {
    if (usage === null) {
      return <p className="text-muted-foreground p-1">{t('llm.storage.loading')}</p>;
    }
    if (entry !== undefined) {
      const onTake = (key: string): void => void take(entry, key);
      const onOpenFile = (picked: File): void => void openFile(entry, picked);
      const onCloseFile = (): void => closeFile(entry.id);
      return (
        <ItemList
          entry={entry}
          connected={connected}
          marks={marks}
          busy={busy}
          onToggle={toggleOne}
          onTake={onTake}
          onOpenFile={onOpenFile}
          onCloseFile={onCloseFile}
        />
      );
    }
    if (selected === COMFY_BACKUP) {
      return (
        <BackupOverview
          entries={entries}
          connected={connected}
          marks={marks}
          onSelect={choose}
          onToggleAll={toggle}
        />
      );
    }
    return (
      <Overview
        usage={usage}
        entries={entries}
        scope={selected}
        connected={connected}
        onSelect={choose}
      />
    );
  };

  const nav = <CategoryNav entries={entries} selected={selected} marks={marks} onSelect={choose} />;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col text-xs"
      onKeyDownCapture={onKeyDownCapture}
      onPointerDown={onPointerDown}
    >
      <StorageBand
        // ピン止めした左の列と同じく、下限まで先に縮む
        leadStyle={
          pinned ? { flexBasis: leftWidth + 1, flexShrink: 1, minWidth: LEFT_MIN + 1 } : undefined
        }
        applyDisabled={busy || marks.size === 0}
        onApply={onApplyClick}
        directory={directoryState}
        onDirectory={cycle}
        path={pathOf(selected, entries)}
        onSelect={choose}
        header={
          entry === undefined ? null : (
            <EntryHeader entry={entry} marks={marks} busy={busy} onToggleAll={toggle} />
          )
        }
        onReload={refresh}
      />

      <div className="flex min-h-0 flex-1">
        {pinned ? (
          <SidePane
            paneKey={PANE_KEY}
            label={t('llm.storage.categories')}
            side="left"
            defaultSize={LEFT_WIDTH}
            minSize={LEFT_MIN}
            maxSize={LEFT_MAX}
            shrinkable
          >
            {nav}
          </SidePane>
        ) : null}

        {/* 一時的に出した左の列はこの中（帯の下）に重ねる。帯の切り替えを覆わない */}
        <div className="relative flex flex-1 flex-col" style={{ minWidth: RIGHT_MIN }}>
          {reloadNeeded ? <ReloadNotice /> : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">{content()}</div>

          {shown && !pinned ? (
            <NavOverlay ref={overlay} width={leftWidth} onResize={onPaneResize}>
              {nav}
            </NavOverlay>
          ) : null}
        </div>
      </div>
    </div>
  );
}
