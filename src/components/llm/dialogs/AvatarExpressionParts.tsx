import { ImageUp, Star, Trash2, Upload } from 'lucide-react';

import { PRESET_EXPRESSION_LABELS } from '@/chat/avatar-expression';
import type { ExpressionDraft } from '@/components/llm/dialogs/expression-draft';
import { CARD_NAME_ICON, cardIcon } from '@/components/shared/card-icon';
import { ImageGrid } from '@/components/shared/ImageGrid';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { filterImageItems, type ImageItem } from '@/graph/image-options';
import { orderedImageItems, useFrozenOrder } from '@/hooks/ui/use-frozen-order';
import { t, type MessageKey } from '@/i18n';
import { blobUrl } from '@/lib/blob-url';
import { cn } from '@/lib/utils';

const ICON = cn(DIALOG_ICON_CLASS, 'shrink-0');

export interface ExpressionBandActionsProps {
  readonly ready: boolean;
  readonly canRemove: boolean;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
}

export function ExpressionBandActions({
  ready,
  canRemove,
  onAdd,
  onRemove,
}: ExpressionBandActionsProps): React.ReactElement {
  return (
    <>
      <BandIcon label="llm.expression.addFiles" disabled={!ready} onClick={onAdd}>
        <Upload className="size-4" aria-hidden />
      </BandIcon>
      <BandIcon label="llm.expression.remove" disabled={!ready || !canRemove} onClick={onRemove}>
        <Trash2 className="size-4" aria-hidden />
      </BandIcon>
    </>
  );
}

function BandIcon({
  label,
  disabled,
  onClick,
  children,
}: {
  readonly label: MessageKey;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={ICON}
      aria-label={t(label)}
      title={t(label)}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export interface ExpressionCardsProps {
  readonly draft: ExpressionDraft;
  readonly query: string;
  readonly ascending: boolean;
  readonly height: number;
  readonly reveal: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly onPlace: (id: string) => void;
  readonly onRename: (id: string, label: string) => boolean;
  readonly onSetDefault: (id: string) => void;
  readonly onReplace: (id: string) => void;
}

export function ExpressionCards({
  draft,
  query,
  ascending,
  height,
  reveal,
  onSelect,
  onPlace,
  onRename,
  onSetDefault,
  onReplace,
}: ExpressionCardsProps): React.ReactElement {
  const items = draft.items.map((item) => ({
    value: item.id,
    path: item.label,
    label: item.label,
  }));
  const { order } = useFrozenOrder(items, ascending, true);
  const visible = filterImageItems(orderedImageItems(items, ascending, order), query);
  const srcOf = (id: string): string | null => {
    const image = draft.items.find((item) => item.id === id)?.image;
    return image === undefined ? null : blobUrl(image);
  };
  return (
    <ImageGrid
      srcOf={srcOf}
      visible={visible}
      count={visible.length}
      done
      attachSentinel={() => undefined}
      height={height}
      value=""
      selected={draft.selectedId}
      reveal={reveal}
      onSelect={(item) => onSelect(item.value === draft.selectedId ? null : item.value)}
      onClear={() => onSelect(null)}
      onPlace={(item) => onPlace(item.value)}
      onRename={(item, label) => onRename(item.value, label)}
      renameOptions={(item) => presetLabelsFor(draft, item.value)}
      cardActions={(item) => (
        <DefaultStar
          item={item}
          isDefault={item.value === draft.defaultId}
          onSetDefault={onSetDefault}
        />
      )}
      cardNameActions={(item) => (
        <button
          type="button"
          className={CARD_NAME_ICON}
          aria-label={t('llm.expression.replaceImage', { name: item.label })}
          title={t('llm.expression.replaceImage', { name: item.label })}
          onClick={() => onReplace(item.value)}
        >
          <ImageUp className="size-3" aria-hidden />
        </button>
      )}
    />
  );
}

function DefaultStar({
  item,
  isDefault,
  onSetDefault,
}: {
  readonly item: ImageItem;
  readonly isDefault: boolean;
  readonly onSetDefault: (id: string) => void;
}): React.ReactElement {
  const label = isDefault
    ? t('llm.expression.isDefault', { name: item.label })
    : t('llm.expression.setDefault', { name: item.label });
  return (
    <button
      type="button"
      className={cardIcon({ shown: isDefault ? 'always' : 'hover' })}
      aria-label={label}
      aria-pressed={isDefault}
      title={label}
      onClick={() => onSetDefault(item.value)}
    >
      <Star className="size-4" fill={isDefault ? 'currentColor' : 'none'} aria-hidden />
    </button>
  );
}

function presetLabelsFor(draft: ExpressionDraft, id: string): readonly string[] {
  const taken = new Set(draft.items.filter((item) => item.id !== id).map((item) => item.label));
  return PRESET_EXPRESSION_LABELS.filter((label) => !taken.has(label));
}
