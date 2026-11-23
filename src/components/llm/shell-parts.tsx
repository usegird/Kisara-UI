import { openChatFile } from '@/components/llm/chat-list/chat-file-picker';
import type { ChatListColumnProps } from '@/components/llm/chat-list/ChatListColumn';
import type { ChatSidePanelProps } from '@/components/llm/side-panel/ChatSidePanel';
import type { ChatWorkspaceProps } from '@/components/llm/workspace/ChatWorkspace';
import { lazyPart } from '@/components/ui/lazy-part';
import { NavToggle } from '@/components/ui/nav-toggle';
import type { ShellContext, ShellKind, ShellParts } from '@/components/ui/shell-parts';
import { t } from '@/i18n';
import { openCardFile } from '@/store/chat/preset-import';
import { useChatLibraryStore } from '@/store/use-chat-library-store';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useStorageDialogStore } from '@/store/use-storage-dialog-store';
import { useTabsStore } from '@/store/use-tabs-store';

const ChatWorkspace = lazyPart<ChatWorkspaceProps>(
  'app.lazy.chat',
  () => import('@/components/llm/workspace/ChatWorkspace').then((m) => m.ChatWorkspace),
  () => null,
);
const ChatSidePanel = lazyPart<ChatSidePanelProps>(
  'app.lazy.chatSettings',
  () => import('@/components/llm/side-panel/ChatSidePanel').then((m) => m.ChatSidePanel),
  () => null,
);
const StorageDialogHost = lazyPart<object>(
  'app.lazy.storage',
  () => import('@/components/llm/dialogs/StorageDialogHost').then((m) => m.StorageDialogHost),
  () => null,
);
const ChatListColumn = lazyPart<ChatListColumnProps>(
  'app.lazy.chatList',
  () => import('@/components/llm/chat-list/ChatListColumn').then((m) => m.ChatListColumn),
  () => null,
);

export const chatShell: ShellKind = { useParts: useChatShellParts, openFile: openChatOrCard };

async function openChatOrCard(file: File): Promise<boolean> {
  return (await openCardFile(file)) || (await openChatFile(file));
}

function useChatShellParts({ anchors }: ShellContext): ShellParts {
  const chatId = useTabsStore(
    (state) => state.tabs.find((tab) => tab.id === state.activeId && tab.kind === 'chat')?.chatId,
  );
  const chatListShown = useChatLibraryStore((state) => state.drawerOpen);
  const chatListPinned = useSettingsStore((state) => !state.chatSidebarCollapsed);
  const storageUsed = useStorageDialogStore((state) => state.used);
  const attachChatArea = anchors.register('chat');

  return {
    active: chatId !== undefined,
    dock: 'right',
    navToggle: (
      <NavToggle
        label={t('llm.sidebar.list')}
        expanded={chatListShown || chatListPinned}
        onToggle={useChatLibraryStore.getState().toggleList}
      />
    ),
    tabMenu: null,
    onRename: (next) => {
      if (chatId !== undefined) useChatStore.getState().update(chatId, { name: next });
    },
    workspace:
      chatId === undefined ? null : (
        <div className="flex h-full min-h-0">
          <ChatListColumn activeChatId={chatId} />
          <div ref={attachChatArea} className="relative h-full min-w-0 flex-1">
            <ChatWorkspace key={chatId} chatId={chatId} />
          </div>
        </div>
      ),
    side: chatId === undefined ? null : <ChatSidePanel chatId={chatId} />,
    overlay: null,
    overlayOnOthers: null,
    header: null,
    background: null,
    toasts: null,
    dialogs: null,
    windows: storageUsed ? <StorageDialogHost /> : null,
  };
}
