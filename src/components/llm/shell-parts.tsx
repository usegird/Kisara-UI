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

// ─────────────────────────────
// 会話のタブが外枠に差し込む部品。会話の画面・左右の列は、会話のタブを開いたときだけ読む。
// ─────────────────────────────

// 会話のタブの中身と右の列も、会話のタブを開いたときだけ読む
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
// ストレージの管理と古いバックアップの知らせ。開く・知らせるときに読む
const StorageDialogHost = lazyPart<object>(
  'app.lazy.storage',
  () => import('@/components/llm/dialogs/StorageDialogHost').then((m) => m.StorageDialogHost),
  () => null,
);
// 会話の左の列。会話のタブを開いたときだけ読む
const ChatListColumn = lazyPart<ChatListColumnProps>(
  'app.lazy.chatList',
  () => import('@/components/llm/chat-list/ChatListColumn').then((m) => m.ChatListColumn),
  () => null,
);

/** 会話の種別。会話のタブの中身と、キャラクターカード・会話のファイルを開くことを持つ */
export const chatShell: ShellKind = { useParts: useChatShellParts, openFile: openChatOrCard };

/** キャラクターカードと会話のファイルを会話として開く。どちらでもなければ false */
async function openChatOrCard(file: File): Promise<boolean> {
  return (await openCardFile(file)) || (await openChatFile(file));
}

/** 会話のタブの欄の中身を組む */
function useChatShellParts({ anchors }: ShellContext): ShellParts {
  // 会話のタブなら会話の id。それ以外のタブの中身は既定の種別が持つ
  const chatId = useTabsStore(
    (state) => state.tabs.find((tab) => tab.id === state.activeId && tab.kind === 'chat')?.chatId,
  );
  // 会話の一覧は列と同じ状態
  const chatListShown = useChatLibraryStore((state) => state.drawerOpen);
  const chatListPinned = useSettingsStore((state) => !state.chatSidebarCollapsed);
  const storageUsed = useStorageDialogStore((state) => state.used);
  const attachChatArea = anchors.register('chat');

  return {
    active: chatId !== undefined,
    // 会話の右の列は置き場所を選べず右に固定なので、会話のタブでは外枠も右の並びにする
    // （保存した置き場所が下でも、会話の列を下の並びに入れない）
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
    // 会話のタブは左に会話の一覧の列を置く
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
    // ストレージの管理と古いバックアップの知らせ。設定の欄・知らせのどちらからでも同じ 1 つ
    windows: storageUsed ? <StorageDialogHost /> : null,
  };
}
