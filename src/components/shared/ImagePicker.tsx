import { cva } from 'class-variance-authority';
import { CaseSensitive } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { ImageGrid } from '@/components/shared/ImageGrid';
import { UploadButton } from '@/components/shared/ImageUploadButton';
import { DialogFrame } from '@/components/ui/dialog';
import { PickerBand } from '@/components/ui/picker-band';
import { filterImageItems, sortImageItems, type ImageItem } from '@/graph/image-options';
import type { UploadOutcome } from '@/hooks/comfy/use-image-upload';
import { useIncrementalList } from '@/hooks/ui/use-incremental-list';
import { t } from '@/i18n';
import { CARD_LIST_STEP } from '@/store/settings-fields/card-size';
import { useSettingsStore } from '@/store/use-settings-store';

interface Notice {
  readonly text: string;
  readonly failed: boolean;
}

const dropOverlay = cva(
  `border-primary bg-primary/5 text-primary pointer-events-none absolute inset-2 z-10 flex
    items-center justify-center rounded-md border-2 border-dashed text-sm`,
);

function carriesFiles(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes('Files');
}

export const NONE_IMAGE = '\u0000none';

interface ImagePickerSelection {
  readonly item: ImageItem | null;
  readonly clear: () => void;
  readonly notify: (text: string, failed: boolean) => void;
}

export interface ImagePickerProps {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly trigger: React.ReactNode;
  readonly value: string;
  readonly items: readonly ImageItem[];
  readonly srcOf: (value: string) => string | null;
  readonly uploading: boolean;
  readonly uploadDisabled: boolean;
  readonly upload: (files: readonly File[]) => Promise<UploadOutcome>;
  readonly headerActions?: React.ReactNode;
  readonly bandActions?: (selection: ImagePickerSelection) => React.ReactNode;
  readonly onPlace: (value: string) => void;
  readonly noneLabel?: string | undefined;
}

export function ImagePicker({
  id,
  title,
  subtitle,
  trigger,
  value,
  items,
  srcOf,
  uploading,
  uploadDisabled,
  upload,
  headerActions,
  bandActions,
  onPlace,
  noneLabel,
}: ImagePickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setNotice(null);
    setDropping(false);
    setReveal(null);
    if (open) setSelected(initialSelectionOf(value, noneLabel));
  }

  const height = useSettingsStore((state) => state.modelCardHeight);
  const ascending = useSettingsStore((state) => state.imageSortAscending);
  const setAscending = useSettingsStore((state) => state.setImageSortAscending);
  const none = useMemo(
    (): ImageItem | null =>
      noneLabel === undefined ? null : { value: NONE_IMAGE, path: noneLabel, label: noneLabel },
    [noneLabel],
  );
  const visible = useMemo(
    () => [
      ...(none === null ? [] : [none]),
      ...filterImageItems(sortImageItems(items, ascending), query),
    ],
    [none, items, ascending, query],
  );
  const selectedItem = useMemo(
    () => selectedItemOf(selected, none, items),
    [items, none, selected],
  );
  const { count, done, sentinelRef } = useIncrementalList(
    visible.length,
    CARD_LIST_STEP,
    `${query} ${String(ascending)}`,
  );
  const revealIndex = reveal === null ? -1 : visible.findIndex((item) => item.value === reveal);
  const shown = Math.max(count, revealIndex + 1);

  const place = (picked: string): void => {
    onPlace(picked === NONE_IMAGE ? '' : picked);
    setOpen(false);
  };

  const sendFiles = (files: readonly File[]): void => {
    if (files.length === 0 || uploading) return;
    setNotice(null);
    void upload(files).then((outcome: UploadOutcome) => {
      if (!outcome.ok) {
        setNotice({ text: outcome.notice, failed: true });
        return;
      }
      setSelected(outcome.value);
      setReveal(outcome.value);
      setNotice(outcome.notice === null ? null : { text: outcome.notice, failed: false });
    });
  };

  return (
    <DialogFrame
      id={id}
      movable
      open={open}
      onOpenChange={setOpen}
      size="xl"
      trigger={trigger}
      title={title}
      subtitle={subtitle}
      actions={headerActions}
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onKeyDownCapture={(event) => {
          if (event.key !== 'Escape' || selected === null) return;
          setSelected(null);
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragOver={(event) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDropping(true);
        }}
        onDragLeave={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          setDropping(false);
        }}
        onDrop={(event) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          setDropping(false);
          sendFiles([...event.dataTransfer.files]);
        }}
      >
        <PickerBand
          decideToolbar={t('imagePicker.decide.toolbar')}
          decideLabel={t('imagePicker.decide.label')}
          decideTitle={
            selectedItem === null
              ? t('modelPicker.nothingSelected')
              : t('modelPicker.decide.title', { name: selectedItem.label })
          }
          decideDisabled={selectedItem === null}
          decideIcon="set"
          onDecide={() => {
            if (selectedItem !== null) place(selectedItem.value);
          }}
          actions={
            <>
              <UploadButton
                uploading={uploading}
                disabled={uploadDisabled}
                fileInput={fileInput}
                onFiles={sendFiles}
              />
              {bandActions?.({
                item: selectedItem,
                clear: () => setSelected(null),
                notify: (text, failed) => setNotice({ text, failed }),
              })}
            </>
          }
          filterToolbar={t('imagePicker.filter.toolbar')}
          filterLabel={t('imagePicker.filter.label')}
          query={query}
          onQuery={setQuery}
          sortOptions={[{ key: 'name', label: t('modelPicker.sort.name'), Icon: CaseSensitive }]}
          sortKey="name"
          ascending={ascending}
          onSort={(_key, next) => setAscending(next)}
          height={height}
          notice={notice}
        />

        <ImageGrid
          srcOf={srcOf}
          visible={visible}
          count={shown}
          done={done || shown >= visible.length}
          attachSentinel={sentinelRef}
          height={height}
          value={value === '' ? NONE_IMAGE : value}
          selected={selected}
          reveal={reveal}
          onSelect={(item) => setSelected(item.value === selected ? null : item.value)}
          onClear={() => setSelected(null)}
          onPlace={(item) => place(item.value)}
        />
        {dropping ? <div className={dropOverlay()}>{t('imagePicker.upload.drop')}</div> : null}
      </div>
    </DialogFrame>
  );
}

function initialSelectionOf(value: string, noneLabel: string | undefined): string | null {
  if (value !== '') return value;
  return noneLabel === undefined ? null : NONE_IMAGE;
}

function selectedItemOf(
  selected: string | null,
  none: ImageItem | null,
  items: readonly ImageItem[],
): ImageItem | null {
  if (selected === null) return null;
  if (selected === NONE_IMAGE) return none;
  return items.find((item) => item.value === selected) ?? null;
}
