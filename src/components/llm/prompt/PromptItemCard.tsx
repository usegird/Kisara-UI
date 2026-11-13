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

// ─────────────────────────────
// プロンプトの項目の 1 枚。有効かどうかはチェックではなく文字の色で表す（無効の項目もその場に灰色で並ぶ）。
// ─────────────────────────────

/** 右端の操作。指したときと焦点があるときだけ出す（`visible` ならいつも出す） */
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

/** 項目の 1 枚に出す、本文の頭か印の出どころ */
export interface ItemSummary {
  readonly text: string;
  /** 出どころが無い（薄く出す） */
  readonly empty: boolean;
  /** 印の項目を開いたときに出す中身（文面の項目では使わない） */
  readonly source: string;
  /** 印の項目の中身が無いときに、そこに何が入るかを示す文 */
  readonly note: string;
  /**
   * 追加辞書の一覧（送る順）
   */
  readonly lore: readonly AdditionalInfoRow[];
  /**
   * 開いたときに会話の写しのプリセットの欄を直すなら、その欄（プリセットは変えない）
   */
  readonly card: {
    readonly field: CardField;
    readonly value: string;
  } | null;
}

/** プロンプトの項目の 1 枚の props */
export interface PromptItemCardProps {
  readonly chatId: string;
  readonly item: PromptItem;
  /** 見積もり。数か、打ちかけを購読する要素（PromptItemListProps.tokens）。無ければ undefined */
  readonly tokens: React.ReactNode;
  readonly summary: ItemSummary;
  readonly open: boolean;
  readonly onToggle: (id: string) => void;
  /** 項目を消す（取り消しの控えを取ってから消す） */
  readonly onRemove: (id: string) => void;
  /** 足したばかりで、名前の欄を開いて出す（項目を追加で足したとき） */
  readonly naming?: boolean | undefined;
  /** 足したばかりの名前の欄を閉じた */
  readonly onNamed?: (() => void) | undefined;
}

/**
 * 項目の 1 枚。どの行も dnd-kit の並べ替えの並びに加え、運んでいる間はずれて落としたあとの並びを
 * 見せる。会話履歴・メッセージ・追加辞書の印・履歴後の指示は掴めず、掴みの代わりに鍵を出す
 */
export function PromptItemCard(
  props: PromptItemCardProps & {
    readonly slot?: DropSlot | undefined;
    /** 動かせない行の地を前後の行とつなげるか */
    readonly join?: BandJoin | undefined;
  },
): React.ReactElement {
  const fixed = isFixedItem(props.item) || isAnchorItem(props.item);
  // 動かせない行は掴めない。どの行も落とし先のまま置いて行の大きさを測らせ、入れられない会話履歴の帯を
  // 指せないことは一覧の当たり判定で決める（決まりは dropSlots）。運んでいる間は落としたあとの並びへずれる
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
    data: { label: itemLabel(props.item) },
    attributes: sortableAttributes(),
    disabled: { draggable: fixed, droppable: false },
  });
  // 中身の無い行（無効・本文の空・発言の無い履歴・打ちかけの無いメッセージ）は灰色の文字にする
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

/** 項目の見出しの行と、開いているときの直す欄。掴みが無ければ字下げしない */
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
  // 会話の履歴とメッセージはいつも送る（外せない）。開くと中身を読むだけで出す。
  // 追加辞書の印も名前を直せず、消せない
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
          // 一時的に無効にする（無効なら有効に戻す）と削除（すぐ消し、Ctrl+Z で戻せる）
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

/**
 * 動かせない行の掴みの列に出す鍵。押せない
 */
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

/** 行の右端の操作のアイコンのボタン。既定は行を指したときと焦点があるときだけ出す */
export function ActionButton({
  label,
  onClick,
  visible = false,
  disabled = false,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  /** いつも出す（既定は、行を指したときと焦点があるときだけ） */
  readonly visible?: boolean;
  /** 押せない（いつも出す操作で、今は使えないもの） */
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
