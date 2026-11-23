import { cva } from 'class-variance-authority';
import { Check, Loader2, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { CARD_NAME_ICON } from '@/components/shared/card-icon';
import { HistoryCombobox } from '@/components/ui/history-combobox';
import type { ImageItem } from '@/graph/image-options';
import { usePreviewSlot } from '@/hooks/ui/use-preview-slot';
import { t } from '@/i18n';
import { isComposingKey } from '@/lib/text-entry';

const cardFrame = cva('group relative flex flex-col overflow-hidden rounded-md border', {
  variants: { selected: { true: 'ring-ring ring-2', false: '' } },
});
const cardName = cva('w-full truncate px-1.5 py-1 text-2xs', {
  variants: { icons: { 0: '', 1: 'pr-6', 2: 'pr-11' } },
});
const NAME_ICONS = 'absolute right-0.5 bottom-0.5 flex items-center';
const RENAME_FIELD = `border-input bg-background absolute inset-x-0.5 bottom-0.5 rounded-sm
  border px-1 py-0.5 text-2xs`;
const RENAME_BOX = 'absolute inset-x-0.5 bottom-0.5 flex';
const cardImage = cva('size-full object-contain', {
  variants: { ready: { true: '', false: 'opacity-0' } },
});

export interface ImageCardProps {
  readonly item: ImageItem;
  readonly src: string | null;
  readonly height: number;
  readonly current: boolean;
  readonly selected: boolean;
  readonly reveal: boolean;
  readonly onSelect: (item: ImageItem) => void;
  readonly onPlace: (item: ImageItem) => void;
  readonly actions?: React.ReactNode | undefined;
  readonly leadingActions?: React.ReactNode | undefined;
  readonly nameActions?: React.ReactNode | undefined;
  readonly onRename?: ((item: ImageItem, name: string) => boolean) | undefined;
  readonly renameOptions?: readonly string[] | undefined;
}

export function ImageCard({
  item,
  src,
  height,
  current,
  selected,
  reveal,
  onSelect,
  onPlace,
  actions,
  leadingActions,
  nameActions,
  onRename,
  renameOptions,
}: ImageCardProps): React.ReactElement {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const slot = usePreviewSlot(src);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reveal) box.current?.scrollIntoView({ block: 'nearest' });
  }, [reveal]);

  return (
    <div ref={box} className={cardFrame({ selected })} style={{ height }}>
      <button
        type="button"
        className="hover:bg-accent flex min-h-0 w-full flex-1 flex-col text-left"
        title={item.path}
        aria-pressed={selected}
        onClick={(event) => {
          if (event.detail < 2) onSelect(item);
        }}
        onDoubleClick={() => onPlace(item)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !selected || isComposingKey(event)) return;
          event.preventDefault();
          onPlace(item);
        }}
      >
        <span className="bg-muted relative flex min-h-0 w-full flex-1 items-center justify-center">
          {src === null || state === 'failed' ? (
            <span className="text-muted-foreground px-2 text-center text-3xs break-all">
              {item.label}
            </span>
          ) : !slot.granted ? (
            <Loader2
              className="text-muted-foreground absolute size-5 motion-safe:animate-spin"
              aria-hidden
            />
          ) : (
            <>
              <img
                src={src}
                alt=""
                decoding="async"
                draggable={false}
                className={cardImage({ ready: state === 'ready' })}
                onLoad={() => {
                  slot.release();
                  setState('ready');
                }}
                onError={() => {
                  slot.release();
                  setState('failed');
                }}
              />
              {state === 'ready' ? null : (
                <Loader2
                  className="text-muted-foreground absolute size-5 motion-safe:animate-spin"
                  aria-hidden
                />
              )}
            </>
          )}
          {current ? (
            <>
              <Check className="text-foreground absolute top-1 left-1 size-4" aria-hidden />
              <span className="sr-only">{t('modelPicker.card.current')}</span>
            </>
          ) : null}
        </span>
        <span className={cardName({ icons: nameIconCount(onRename, nameActions) })}>
          {item.label}
        </span>
      </button>
      {isEmpty(leadingActions) ? null : (
        <span className="absolute top-1 left-1 flex items-center gap-0.5">{leadingActions}</span>
      )}
      {isEmpty(actions) ? null : (
        <span className="absolute top-1 right-1 flex items-center gap-0.5">{actions}</span>
      )}
      {onRename === undefined && isEmpty(nameActions) ? null : (
        <CardRename
          label={item.label}
          onRename={onRename === undefined ? null : (name) => onRename(item, name)}
          extra={nameActions}
          options={renameOptions}
        />
      )}
    </div>
  );
}

function CardRename({
  label,
  onRename,
  extra,
  options,
}: {
  readonly label: string;
  readonly onRename: ((name: string) => boolean) | null;
  readonly extra: React.ReactNode;
  readonly options: readonly string[] | undefined;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(label);
  const commit = (name: string = text): void => {
    if (onRename === null || name.trim() === label || onRename(name)) setEditing(false);
  };
  if (editing && options !== undefined) {
    return (
      <div data-card-rename="" className={RENAME_BOX}>
        <HistoryCombobox
          value={text}
          onValueChange={setText}
          items={options}
          label={t('imagePicker.card.rename', { name: label })}
          className="w-full text-2xs"
          autoFocus
          onBlur={() => commit()}
          onEnter={() => commit()}
          onPick={commit}
          onEscape={() => setEditing(false)}
        />
      </div>
    );
  }
  if (!editing) {
    return (
      <span className={NAME_ICONS}>
        {onRename === null ? null : (
          <button
            type="button"
            className={CARD_NAME_ICON}
            aria-label={t('imagePicker.card.rename', { name: label })}
            title={t('imagePicker.card.rename', { name: label })}
            onClick={() => {
              setText(label);
              setEditing(true);
            }}
          >
            <Pencil className="size-3" aria-hidden />
          </button>
        )}
        {extra}
      </span>
    );
  }
  return (
    <input
      autoFocus
      className={RENAME_FIELD}
      data-card-rename=""
      value={text}
      aria-label={t('imagePicker.card.rename', { name: label })}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => commit()}
      onKeyDown={(event) => {
        if (isComposingKey(event)) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setEditing(false);
        }
      }}
    />
  );
}

function isEmpty(node: React.ReactNode): boolean {
  return node === undefined || node === null || node === false;
}

function nameIconCount(onRename: unknown, extra: React.ReactNode): 0 | 1 | 2 {
  if (onRename !== undefined && !isEmpty(extra)) return 2;
  return onRename === undefined && isEmpty(extra) ? 0 : 1;
}
