import { useSortable } from '@dnd-kit/sortable';
import { cva } from 'class-variance-authority';
import { Eye, EyeOff, GripVertical, Lock, Trash2 } from 'lucide-react';

import type { CardField } from '@/chat/card';
import { isAnchorItem, isFixedItem, updatePromptItem, type DropSlot } from '@/chat/prompt';
import type { PromptItem } from '@/chat/types';
import type { AdditionalInfoRow } from '@/components/llm/prompt/additional-info-rows';
import { CardHeader } from '@/components/llm/prompt/CardHeader';
import { cardRow, NO_JOIN, type BandJoin } from '@/components/llm/prompt/prompt-card-style';
import { defaultItemLabel, itemLabel } from '@/components/llm/prompt/prompt-text';
import { PromptItemEditor } from '@/components/llm/prompt/PromptItemEditor';
import { sortableAttributes } from '@/components/ui/drag-announcements';
import { sortableStyle } from '@/components/ui/sortable-style';
import { slideKey } from '@/hooks/ui/use-reorder-slide';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';

const action = cva(
  `text-muted-foreground hover:text-foreground shrink-0 rounded-sm focus:opacity-100
    disabled:pointer-events-none disabled:opacity-40`,
  {
    variants: {
      visible: {
        true: '',
        false: 'opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100',
      },
    },
  },
);

export interface ItemSummary {
  readonly text: string;
  readonly empty: boolean;
  readonly source: string;
  readonly note: string;
  readonly lore: readonly AdditionalInfoRow[];
  readonly card: {
    readonly field: CardField;
    readonly value: string;
  } | null;
}

export interface PromptItemCardProps {
  readonly chatId: string;
  readonly item: PromptItem;
  readonly tokens: React.ReactNode;
  readonly summary: ItemSummary;
  readonly open: boolean;
  readonly onToggle: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly naming?: boolean | undefined;
  readonly onNamed?: (() => void) | undefined;
}

export function PromptItemCard(
  props: PromptItemCardProps & {
    readonly slot?: DropSlot | undefined;
    readonly join?: BandJoin | undefined;
  },
): React.ReactElement {
  const fixed = isFixedItem(props.item) || isAnchorItem(props.item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
    data: { label: itemLabel(props.item) },
    attributes: sortableAttributes(),
    disabled: { draggable: fixed, droppable: false },
  });
  const quiet = !props.item.enabled || props.summary.empty;
  return (
    <li
      ref={setNodeRef}
      style={sortableStyle(transform, transition)}
      className={cardRow({
        enabled: !quiet,
        dragging: isDragging,
        locked: fixed,
        ...(fixed ? (props.join ?? NO_JOIN) : NO_JOIN),
      })}
      {...slideKey(props.item.id)}
    >
      <ItemBody
        {...props}
        grip={
          fixed ? (
            <LockMark />
          ) : (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none
                rounded-sm"
              aria-label={t('llm.prompt.reorder', { name: itemLabel(props.item) })}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" aria-hidden />
            </button>
          )
        }
      />
    </li>
  );
}

function ItemBody({
  chatId,
  item,
  tokens,
  summary,
  open,
  onToggle,
  onRemove,
  naming,
  onNamed,
  grip,
}: PromptItemCardProps & { readonly grip?: React.ReactNode }): React.ReactElement {
  const label = itemLabel(item);
  const fixed = isFixedItem(item) || isAnchorItem(item);

  return (
    <div className="flex min-w-0 flex-col">
      <CardHeader
        label={label}
        position={
          item.position.kind === 'depth'
            ? t('llm.prompt.depth', { depth: item.position.depth })
            : null
        }
        tokens={item.enabled ? tokens : undefined}
        summary={summary.text}
        open={open}
        onToggle={() => onToggle(item.id)}
        onRename={
          !fixed
            ? (name) =>
                useChatStore
                  .getState()
                  .updatePrompt(chatId, (prompt) => updatePromptItem(prompt, item.id, { name }))
            : undefined
        }
        defaultLabel={defaultItemLabel(item)}
        startRenaming={naming}
        onRenameEnd={onNamed}
        struck={!item.enabled}
        actions={
          fixed ? null : (
            <>
              <ActionButton
                label={t(item.enabled ? 'llm.prompt.disable' : 'llm.prompt.enable', {
                  name: label,
                })}
                onClick={() =>
                  useChatStore
                    .getState()
                    .updatePrompt(chatId, (prompt) =>
                      updatePromptItem(prompt, item.id, { enabled: !item.enabled }),
                    )
                }
              >
                {item.enabled ? (
                  <EyeOff className="size-3.5" aria-hidden />
                ) : (
                  <Eye className="size-3.5" aria-hidden />
                )}
              </ActionButton>
              <ActionButton
                label={t('llm.prompt.removeOf', { name: label })}
                onClick={() => onRemove(item.id)}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </ActionButton>
            </>
          )
        }
        grip={grip}
      />
      {open ? (
        <div>
          <PromptItemEditor chatId={chatId} item={item} summary={summary} />
        </div>
      ) : null}
    </div>
  );
}

export function LockMark(): React.ReactElement {
  return (
    <span
      role="img"
      aria-label={t('llm.prompt.locked')}
      title={t('llm.prompt.locked')}
      className="text-muted-foreground shrink-0"
    >
      <Lock className="size-3.5" aria-hidden />
    </span>
  );
}

export function ActionButton({
  label,
  onClick,
  visible = false,
  disabled = false,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={action({ visible })}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
