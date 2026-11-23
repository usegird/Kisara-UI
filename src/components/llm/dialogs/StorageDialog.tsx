import { useEffect, useState } from 'react';

import {
  applyMarks,
  openStorageFile,
  readRemoteLists,
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
  staleBackupsOf,
  toggleMarks,
  withoutReferenceMarks,
  type Mark,
  type Marks,
} from '@/components/llm/dialogs/storage-marks';
import { RIGHT_MIN } from '@/components/llm/dialogs/storage-style';
import { BackupOverview, CleanupHeader } from '@/components/llm/dialogs/StorageBackupOverview';
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

const DIALOG_ID = 'llm-storage';
const PANE_KEY = `${DIALOG_ID}:left`;
const PIN_KEY = `${DIALOG_ID}:directory`;
const LEFT_MAX = 194;
const LEFT_WIDTH = LEFT_MAX;
const LEFT_MIN = 140;
const FRAME_EXTRA = 4;
const STORAGE_DIALOG_MIN = {
  width: LEFT_MIN + RIGHT_MIN + FRAME_EXTRA,
  height: DIALOG_MIN.height,
};

export interface StorageDialogProps {
  readonly open: boolean;
  readonly start?: StorageDialogStart;
  readonly onOpenChange: (open: boolean) => void;
}

export function StorageDialog({
  open,
  start = 'overview',
  onOpenChange,
}: StorageDialogProps): React.ReactElement {
  return (
    <DialogFrame
      id={DIALOG_ID}
      size="lg"
      minSize={STORAGE_DIALOG_MIN}
      movable
      modal={false}
      embeddable={false}
      open={open}
      onOpenChange={onOpenChange}
      title={t('llm.storage.title')}
    >
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
  const [openedAt] = useState(Date.now);
  const [files, setFiles] = useState<ReadonlyMap<string, OpenedFile>>(new Map());
  const refresh = (): void => setRevision((value) => value + 1);

  useEffect(() => {
    let alive = true;
    void readStorageUsage().then((found) => {
      if (alive) setUsage(found);
    });
    return () => {
      alive = false;
    };
  }, [revision]);

  useEffect(() => {
    if (!connected) return undefined;
    let alive = true;
    void readRemoteLists(BACKUP_KINDS, listBackups).then((found) => {
      if (alive) setBackups(found);
    });
    void readRemoteLists(USER_FILE_KINDS, listUserFileItems).then((found) => {
      if (alive) setUserFiles(found);
    });
    return () => {
      alive = false;
    };
  }, [connected, revision]);

  const entries = buildEntries({ usage, connected, backups, userFiles, files });
  const entry = entries.find((item) => item.id === selected);
  const stale = staleBackupsOf(entries, connected, openedAt);

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

  const apply = async (): Promise<void> => {
    setBusy(true);
    const outcome = await applyMarks(
      [...marks.values()],
      new Map(entries.map((item) => [item.id, item])),
    );
    setBusy(false);
    setMarks(new Map());
    toastApplied(outcome);
    if (outcome.local) {
      reloadPage();
      return;
    }
    if (outcome.indexedDb) setReloadNeeded(true);
    refresh();
  };

  const take = async (target: Entry, key: string): Promise<void> => {
    if (await takeEntryBackup(target, key)) refresh();
  };

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
          stale={stale}
          marks={marks}
          busy={busy}
          onSelect={choose}
          onToggle={toggleOne}
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

  const header = (): React.ReactNode => {
    if (entry !== undefined) {
      return <EntryHeader entry={entry} marks={marks} busy={busy} onToggleAll={toggle} />;
    }
    if (selected !== COMFY_BACKUP || stale === null) return null;
    return <CleanupHeader stale={stale} marks={marks} busy={busy} onToggleAll={toggle} />;
  };

  const nav = <CategoryNav entries={entries} selected={selected} marks={marks} onSelect={choose} />;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col text-xs"
      onKeyDownCapture={onKeyDownCapture}
      onPointerDown={onPointerDown}
    >
      <StorageBand
        leadStyle={
          pinned ? { flexBasis: leftWidth + 1, flexShrink: 1, minWidth: LEFT_MIN + 1 } : undefined
        }
        applyDisabled={busy || marks.size === 0}
        onApply={onApplyClick}
        directory={directoryState}
        onDirectory={cycle}
        path={pathOf(selected, entries)}
        onSelect={choose}
        header={header()}
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
