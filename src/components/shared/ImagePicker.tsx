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

// ─────────────────────────────
// 画像をカードで選ぶダイアログ。画像の出どころと置き方は呼び出し元が渡し、呼び出し元の部品・
// ストアを知らない。開け閉ては基盤の Trigger に任せる。
// ─────────────────────────────

/** 知らせ。失敗は赤、それ以外（名前が変わったなど）はふつうの色 */
interface Notice {
  readonly text: string;
  readonly failed: boolean;
}

/** ファイルを掴んで持ってきている間、格子に出す落とし先の枠 */
const dropOverlay = cva(
  `border-primary bg-primary/5 text-primary pointer-events-none absolute inset-2 z-10 flex
    items-center justify-center rounded-md border-2 border-dashed text-sm`,
);

/** 掴んでいるのがファイルか（文字や要素のドラッグは受けない） */
function carriesFiles(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes('Files');
}

/** 先頭の「なし」のカードの値（画像の値と重ならない）。決定すると空の値を返す */
export const NONE_IMAGE = '\u0000none';

/** 帯に足す操作に渡すもの */
interface ImagePickerSelection {
  /** 選んでいるカード。無ければ null */
  readonly item: ImageItem | null;
  /** 選んでいるカードを外す */
  readonly clear: () => void;
  /** 帯に知らせを出す（失敗なら赤） */
  readonly notify: (text: string, failed: boolean) => void;
}

/** 画像を選ぶダイアログの props */
export interface ImagePickerProps {
  /** ダイアログの id（位置と大きさを覚える鍵） */
  readonly id: string;
  readonly title: string;
  /** 見出しの補足 */
  readonly subtitle?: string | undefined;
  /** 開く引き金 */
  readonly trigger: React.ReactNode;
  /** 現在の値（✓ を付けるカード） */
  readonly value: string;
  readonly items: readonly ImageItem[];
  /** カードの画像の URL。作れなければ null（名前だけの枠） */
  readonly srcOf: (value: string) => string | null;
  readonly uploading: boolean;
  /** アップロードできない（つながっていないなど） */
  readonly uploadDisabled: boolean;
  /** 画像を置き、選ぶ値を返す */
  readonly upload: (files: readonly File[]) => Promise<UploadOutcome>;
  /** 見出しの右端に足す操作（取り直しなど） */
  readonly headerActions?: React.ReactNode;
  /** 帯のアップロードの後ろに足す操作（消すなど） */
  readonly bandActions?: (selection: ImagePickerSelection) => React.ReactNode;
  /** 決定した値を返す。使い道は呼び出し元が決める（「なし」なら空） */
  readonly onPlace: (value: string) => void;
  /** 渡すと、格子の先頭に画像を外す「なし」のカードを置く（その名前） */
  readonly noneLabel?: string | undefined;
}

/**
 * 画像を選ぶダイアログ。帯と画像のカードの格子を置き、ボタンか落とす操作でアップロードする。
 * アップロードを終えたら最後に置いた画像を選び、そのカードまで描いて送る（絞り込みは変えない）
 */
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
  // アップロードして見せたいカード。そこまで描いて送る
  const [reveal, setReveal] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // 開いた瞬間に、いまの値のカードを選んだ状態へ戻す（描画中に前回から直す React の型）
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
  // 「なし」のカードは絞り込み・並びに関わらず先頭に置く。
  // この部品では compiler がこの 3 つを前回の物にしない（外すと描くたびに絞り込み直す）ので、手で書く
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
  // 見せたいカードがまだ描いていない所にあれば、そこまで描く
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
      {/* Esc は選んだカード → ダイアログの順に閉じる。ファイルはダイアログのどこに落としてもよい */}
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
          // 中の要素の間を動いたときは消さない（囲みの外へ出たときだけ）
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
          // 選択肢は名前しか持たないので、並びは名前だけ（向きは変えられる）
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

/** 開いたときに選ぶカード。値が空なら「なし」のカード（無ければ選ばない） */
function initialSelectionOf(value: string, noneLabel: string | undefined): string | null {
  if (value !== '') return value;
  return noneLabel === undefined ? null : NONE_IMAGE;
}

/** 選んでいるカードの画像。「なし」はそのカード、見つからなければ null */
function selectedItemOf(
  selected: string | null,
  none: ImageItem | null,
  items: readonly ImageItem[],
): ImageItem | null {
  if (selected === null) return null;
  if (selected === NONE_IMAGE) return none;
  return items.find((item) => item.value === selected) ?? null;
}
