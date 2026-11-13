import { Menu } from '@base-ui/react/menu';
import { cva } from 'class-variance-authority';
import { ExternalLink, Layers, MoreHorizontal, Server } from 'lucide-react';
import { useState } from 'react';

import type { ChatPlace } from '@/chat/types';
import { chatRow } from '@/components/llm/chat-list/chat-row-style';
import { formatChangeResult } from '@/components/llm/chat-list/library-text';
import { chatNameOf, notify, type ListedChat } from '@/components/llm/chat-list/listed-chat';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MENU_ITEM_CLASS } from '@/components/ui/menu-item';
import { t } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';
import { cn } from '@/lib/utils';
import { duplicateChat, renameChat } from '@/store/chat/chat-library';
import { exportChat } from '@/store/chat/chat-transfer';

// ─────────────────────────────
// 会話の一覧の 1 行。名前・置き場の印・別のタブで開く・行のメニューと、名前を変える欄。
// ─────────────────────────────

/** 行の右端に、指したとき・焦点が当たったときだけ出すアイコン */
const ROW_ICON = `text-muted-foreground hover:text-foreground hover:bg-background absolute top-1/2
  flex size-6 -translate-y-1/2 items-center justify-center rounded opacity-0
  group-focus-within/chat:opacity-100 group-hover/chat:opacity-100`;

/**
 * 「別のタブで開く」のアイコン。今の会話の行では押せなくし、指しても淡く出す（同じ会話は 1 つのタブでしか
 * 開けず、押しても何も変わらないため）
 */
const openTabIcon = cva(
  `text-muted-foreground absolute top-1/2 right-7 flex size-6 -translate-y-1/2 items-center
    justify-center rounded opacity-0`,
  {
    variants: {
      disabled: {
        true: 'group-focus-within/chat:opacity-40 group-hover/chat:opacity-40',
        false: `hover:text-foreground hover:bg-background group-focus-within/chat:opacity-100
          group-hover/chat:opacity-100`,
      },
    },
  },
);

/** 会話の一覧の 1 行。名前を変えている間は欄に替える */
export function ChatRow({
  item,
  active,
  onOpen,
  onOpenTab,
  onClear,
  onDelete,
}: {
  readonly item: ListedChat;
  readonly active: boolean;
  readonly onOpen: () => void;
  /** 別のタブで開く */
  readonly onOpenTab: () => void;
  readonly onClear: () => void;
  readonly onDelete: () => void;
}): React.ReactElement {
  const [renaming, setRenaming] = useState(false);
  const exportJson = (): void => void exportChat(item.id, item.place);
  const duplicate = (): void =>
    void duplicateChat(item.id, item.place).then((result) => notify(formatChangeResult(result)));

  if (renaming) {
    return (
      <RenameField
        initial={item.name}
        onEnd={(name) => {
          setRenaming(false);
          if (name === null) return;
          void renameChat(item.id, item.place, name).then((result) =>
            notify(formatChangeResult(result)),
          );
        }}
      />
    );
  }

  return (
    <div className="group/chat relative">
      <ContextMenuRoot>
        <ContextMenuTrigger
          render={
            <button
              type="button"
              className={cn(chatRow({ active }), 'pr-14')}
              aria-current={active ? 'page' : undefined}
              title={chatNameOf(item)}
              onClick={onOpen}
            />
          }
        >
          {/* 置き場の印は名前のすぐ後ろに続ける */}
          <span className="min-w-0 truncate">{chatNameOf(item)}</span>
          <PlaceMark place={item.place} />
        </ContextMenuTrigger>
        <ContextMenuContent label={chatNameOf(item)}>
          <ContextMenuItem disabled={active} onClick={onOpenTab}>
            {t('llm.sidebar.openTab')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setRenaming(true)}>
            {t('llm.sidebar.rename')}
          </ContextMenuItem>
          <ContextMenuItem onClick={duplicate}>{t('llm.sidebar.duplicate')}</ContextMenuItem>
          <ContextMenuItem onClick={exportJson}>{t('llm.sidebar.export')}</ContextMenuItem>
          <ContextMenuItem onClick={onClear}>{t('llm.sidebar.clear')}</ContextMenuItem>
          <ContextMenuItem onClick={onDelete}>{t('llm.sidebar.delete')}</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenuRoot>

      {/* 指したとき・焦点が当たったときだけ、行の右端に「別のタブで開く」とメニューを出す。
          今の会話の行では「別のタブで開く」を押せない */}
      <button
        type="button"
        // メニューのアイコンのすぐ左に並べる
        className={openTabIcon({ disabled: active })}
        disabled={active}
        aria-label={t('llm.sidebar.openTabOf', { name: chatNameOf(item) })}
        title={t('llm.sidebar.openTab')}
        onClick={onOpenTab}
      >
        <ExternalLink className="size-3.5" aria-hidden />
      </button>
      <Menu.Root>
        <Menu.Trigger
          className={cn(ROW_ICON, 'right-1 data-popup-open:opacity-100')}
          aria-label={t('llm.sidebar.menu', { name: chatNameOf(item) })}
          title={t('llm.sidebar.menu', { name: chatNameOf(item) })}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-50 outline-none" side="right" align="start" sideOffset={4}>
            <Menu.Popup
              className="bg-popover text-popover-foreground min-w-36 rounded-md border p-1 text-sm
                shadow-md outline-none"
            >
              <Menu.Item className={MENU_ITEM_CLASS} disabled={active} onClick={onOpenTab}>
                {t('llm.sidebar.openTab')}
              </Menu.Item>
              <Menu.Item className={MENU_ITEM_CLASS} onClick={() => setRenaming(true)}>
                {t('llm.sidebar.rename')}
              </Menu.Item>
              <Menu.Item className={MENU_ITEM_CLASS} onClick={duplicate}>
                {t('llm.sidebar.duplicate')}
              </Menu.Item>
              <Menu.Item className={MENU_ITEM_CLASS} onClick={exportJson}>
                {t('llm.sidebar.export')}
              </Menu.Item>
              <Menu.Item className={MENU_ITEM_CLASS} onClick={onClear}>
                {t('llm.sidebar.clear')}
              </Menu.Item>
              <Menu.Item className={cn(MENU_ITEM_CLASS, 'text-destructive')} onClick={onDelete}>
                {t('llm.sidebar.delete')}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

/**
 * 行の置き場の印。ブラウザだけなら出さない（控えあり・控えだけ）
 */
function PlaceMark({ place }: { readonly place: ChatPlace }): React.ReactElement | null {
  if (place.kind === 'browser') return null;
  const label = t(place.kind === 'both' ? 'llm.place.both' : 'llm.place.backupOnly');
  const Icon = place.kind === 'both' ? Layers : Server;
  return (
    <span className="text-muted-foreground shrink-0" title={label}>
      <Icon className="size-3" aria-label={label} />
    </span>
  );
}

/** 行の名前を変える欄。Enter で確定、Esc・外へ出ると戻す */
function RenameField({
  initial,
  onEnd,
}: {
  readonly initial: string;
  readonly onEnd: (name: string | null) => void;
}): React.ReactElement {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      className="bg-background outline-ring w-full rounded px-2 py-1 text-sm outline-1"
      value={value}
      aria-label={t('llm.sidebar.renameField')}
      title={t('llm.chat.editHint')}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onEnd(null)}
      onKeyDown={(event) => {
        const key = entryKeyOf(event);
        if (key === 'commit') {
          event.preventDefault();
          onEnd(value.trim());
        } else if (key === 'cancel') {
          event.preventDefault();
          event.stopPropagation();
          onEnd(null);
        }
      }}
    />
  );
}
