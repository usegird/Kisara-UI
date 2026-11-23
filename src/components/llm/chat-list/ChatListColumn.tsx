import { cva } from 'class-variance-authority';
import { FileUp, MessageSquarePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { arrangeChats, chatHead, type ChatPeriod } from '@/chat/meta';
import { BROWSER_PLACE, comfyUrlOf, inBrowser, type ChatPlace } from '@/chat/types';
import { pickChatFile } from '@/components/llm/chat-list/chat-file-picker';
import { chatRow } from '@/components/llm/chat-list/chat-row-style';
import { ChatRow } from '@/components/llm/chat-list/ChatRow';
import { formatChangeResult, formatOpenResult } from '@/components/llm/chat-list/library-text';
import { chatNameOf, notify, type ListedChat } from '@/components/llm/chat-list/listed-chat';
import { StaleBackupRow } from '@/components/llm/chat-list/StaleBackupRow';
import { ColumnDivider } from '@/components/ui/column-divider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { NAV_TOGGLE_MARK } from '@/components/ui/nav-toggle';
import { PinButton } from '@/components/ui/pin-button';
import { t, type MessageKey } from '@/i18n';
import {
  clearChat,
  deleteChat,
  listBrowserChats,
  openChat,
  startNewChatHere,
} from '@/store/chat/chat-library';
import { useChatLibraryStore } from '@/store/use-chat-library-store';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

const PERIOD_LABEL: Readonly<Record<ChatPeriod, MessageKey>> = {
  today: 'llm.library.today',
  yesterday: 'llm.library.yesterday',
  week: 'llm.library.week',
  older: 'llm.library.older',
};

const sidebar = cva('bg-background flex flex-row pt-column-top pb-column-bottom pl-column-gutter', {
  variants: {
    floating: {
      true: `animate-in slide-in-from-left absolute inset-y-0 left-0 z-30 shadow-lg
        animation-duration-150 motion-reduce:animate-none`,
      false: 'shrink-0',
    },
  },
});

const SEP = '\u0000';

function useOpenChats(): readonly ListedChat[] {
  const signature = useChatStore((state) =>
    Object.entries(state.chats)
      .filter(([, chat]) => chat.messages.length > 0)
      .map(([id, chat]) => {
        const place = state.places[id] ?? BROWSER_PLACE;
        const fields = [id, chat.name, chatHead(chat), String(chat.updatedAt)];
        return [...fields, place.kind, comfyUrlOf(place) ?? ''].join(SEP);
      })
      .join('\n'),
  );
  if (signature.length === 0) return [];
  return signature.split('\n').map((line) => {
    const [id = '', name = '', head = '', updatedAt = '0', kind = '', url = ''] = line.split(SEP);
    const place: ChatPlace =
      kind === 'comfy' || kind === 'both' ? { kind, baseUrl: url } : BROWSER_PLACE;
    return { id, name, head, size: 0, createdAt: 0, updatedAt: Number(updatedAt), place };
  });
}

function useListedChats(): readonly ListedChat[] {
  const revision = useChatLibraryStore((state) => state.revision);
  const [stored, setStored] = useState<readonly ListedChat[]>([]);
  const open = useOpenChats();

  useEffect(() => {
    let alive = true;
    void listBrowserChats().then(
      (items) => {
        if (alive) setStored(items);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [revision]);

  const merged = new Map<string, ListedChat>();
  for (const item of stored) merged.set(item.id, item);
  for (const item of open) merged.set(item.id, { ...merged.get(item.id), ...item });
  return [...merged.values()].filter((item) => inBrowser(item.place));
}

export interface ChatListColumnProps {
  readonly activeChatId: string;
}

export function ChatListColumn({ activeChatId }: ChatListColumnProps): React.ReactElement {
  const collapsed = useSettingsStore((state) => state.chatSidebarCollapsed);
  const setCollapsed = useSettingsStore((state) => state.setChatSidebarCollapsed);
  const width = useSettingsStore((state) => state.chatSidebarWidth);
  const resizeSidebar = useSettingsStore((state) => state.resizeChatSidebar);
  const drawer = useChatLibraryStore((state) => state.drawerOpen);
  const setDrawer = useChatLibraryStore((state) => state.setDrawerOpen);
  const inside = useRef(false);

  useEffect(() => {
    if (!drawer) return;
    const reset = (): void => {
      inside.current = false;
    };
    const fromInside = (): boolean => inside.current;
    const onPointer = (event: PointerEvent): void => {
      if (fromInside() || !(event.target instanceof Element)) return;
      if (event.target.closest(`[${NAV_TOGGLE_MARK}]`) !== null) return;
      setDrawer(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (fromInside()) return;
      if (event.key === 'Escape') setDrawer(false);
    };
    document.addEventListener('pointerdown', reset, true);
    document.addEventListener('keydown', reset, true);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', reset, true);
      document.removeEventListener('keydown', reset, true);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [drawer, setDrawer]);

  const shown = !collapsed || drawer;
  return (
    <div
      className="relative flex shrink-0"
      onPointerDown={() => {
        inside.current = true;
      }}
      onKeyDown={() => {
        inside.current = true;
      }}
    >
      {shown ? (
        <nav
          aria-label={t('llm.sidebar.label')}
          className={sidebar({ floating: collapsed })}
          style={{ width }}
        >
          <ChatList
            activeChatId={activeChatId}
            onChosen={() => setDrawer(false)}
            pin={
              <PinButton
                pinned={!collapsed}
                onToggle={() => {
                  setDrawer(false);
                  setCollapsed(!collapsed);
                }}
              />
            }
          />
          <ColumnDivider
            column="chatList"
            label={t('llm.sidebar.label')}
            width={width}
            onResize={(_, delta) => resizeSidebar(delta)}
          />
        </nav>
      ) : null}
    </div>
  );
}

function ChatList({
  activeChatId,
  onChosen,
  pin,
}: {
  readonly activeChatId: string;
  readonly onChosen: () => void;
  readonly pin: React.ReactNode;
}): React.ReactElement {
  const items = useListedChats();
  const [now] = useState(() => Date.now());
  const [deleting, setDeleting] = useState<ListedChat | null>(null);
  const [clearing, setClearing] = useState<ListedChat | null>(null);
  const groups = arrangeChats(items, 'recent', now);
  const byId = new Map(items.map((item) => [item.id, item]));

  const open = (item: ListedChat, here: boolean): void => {
    onChosen();
    void openChat(item.id, item.place, { here }).then((result) => notify(formatOpenResult(result)));
  };

  return (
    <div className="bg-pane mr-1 flex min-h-0 min-w-0 flex-1 flex-col rounded-md">
      <div className="mb-2 p-1 pb-0">
        <button
          type="button"
          className={chatRow({ active: false })}
          onClick={() => {
            onChosen();
            startNewChatHere();
          }}
        >
          <MessageSquarePlus className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t('llm.sidebar.newChat')}</span>
        </button>
        <button
          type="button"
          className={chatRow({ active: false })}
          title={t('llm.sidebar.openFileTitle')}
          onClick={() => {
            onChosen();
            pickChatFile();
          }}
        >
          <FileUp className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t('llm.sidebar.openFile')}</span>
        </button>
        <StaleBackupRow onChosen={onChosen} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-xs">{t('llm.sidebar.empty')}</p>
        ) : null}
        {groups.map((group) => (
          <section key={group.period ?? 'all'} className="pb-2">
            {group.period === null ? null : (
              <h3 className="text-muted-foreground px-2 py-1 text-xs">
                {t(PERIOD_LABEL[group.period])}
              </h3>
            )}
            <ul>
              {group.items.map((item) => {
                const listed = byId.get(item.id);
                if (listed === undefined) return null;
                return (
                  <li key={item.id}>
                    <ChatRow
                      item={listed}
                      active={item.id === activeChatId}
                      onOpen={() => open(listed, true)}
                      onOpenTab={() => open(listed, false)}
                      onClear={() => setClearing(listed)}
                      onDelete={() => setDeleting(listed)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex items-center justify-end px-1 pb-1">{pin}</div>
      <ConfirmDialog
        open={deleting !== null}
        title={t('llm.library.confirmDelete.title')}
        description={t('llm.library.confirmDelete.description', {
          name: deleting === null ? '' : chatNameOf(deleting),
        })}
        confirmLabel={t('common.deleteConfirm')}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target === null) return;
          void deleteChat(target.id).then((result) => notify(formatChangeResult(result)));
        }}
        onCancel={() => setDeleting(null)}
      />
      <ConfirmDialog
        open={clearing !== null}
        title={t('llm.library.confirmClear.title')}
        description={t('llm.library.confirmClear.description', {
          name: clearing === null ? '' : chatNameOf(clearing),
        })}
        confirmLabel={t('common.clearConfirm')}
        onConfirm={() => {
          const target = clearing;
          setClearing(null);
          if (target === null) return;
          void clearChat(target.id, target.place).then((result) =>
            notify(formatChangeResult(result)),
          );
        }}
        onCancel={() => setClearing(null)}
      />
    </div>
  );
}
