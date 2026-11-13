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
import { ColumnDivider } from '@/components/ui/column-divider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { NAV_TOGGLE_MARK } from '@/components/ui/nav-toggle';
import { PinButton } from '@/components/ui/pin-button';
import { t, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';
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

// ─────────────────────────────
// 会話の左の列と、縮めたときの引き出し（引き出しの状態はストア。ヘッダーのメニューと同じものを見る）。
// 一覧は置き場の一覧の項目（本文は読まない）に、開いている会話の名前と時刻を重ねて出す。
// ─────────────────────────────

const PERIOD_LABEL: Readonly<Record<ChatPeriod, MessageKey>> = {
  today: 'llm.library.today',
  yesterday: 'llm.library.yesterday',
  week: 'llm.library.week',
  older: 'llm.library.older',
};

// 列と引き出しの枠。上の余白は ComfyUI の列の上端（8px の基準線）、
// 下の余白は会話の入力欄の下（18px）と右の列の下に揃える。右端の境目で幅を変える
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

/**
 * 開いている会話（メッセージのあるものだけ）を、名前・頭・時刻・置き場をつないだ 1 本の文字列で購読する
 * （受け取り中の本文の増加では描き直さない）
 */
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

/**
 * ブラウザの会話に、開いている会話を重ねた一覧（ComfyUI の控えだけの会話は出さない）。
 * **内部識別子（会話の id）が同じものは 1 件**にまとめる
 */
function useListedChats(): readonly ListedChat[] {
  const revision = useChatLibraryStore((state) => state.revision);
  const [stored, setStored] = useState<readonly ListedChat[]>([]);
  const open = useOpenChats();

  // 置き場の一覧を取る（外の置き場との同期）
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

/** 会話の左の列の props */
export interface ChatListColumnProps {
  /** アクティブなタブの会話 */
  readonly activeChatId: string;
}

/** 「新しい会話」と残した会話の一覧の列。縮めると場所を取らず、引き出しとして本体の左端から出す */
export function ChatListColumn({ activeChatId }: ChatListColumnProps): React.ReactElement {
  // 縮めたか（ピン止め）と幅は端末に残す（設定のストア）
  const collapsed = useSettingsStore((state) => state.chatSidebarCollapsed);
  const setCollapsed = useSettingsStore((state) => state.setChatSidebarCollapsed);
  const width = useSettingsStore((state) => state.chatSidebarWidth);
  const resizeSidebar = useSettingsStore((state) => state.resizeChatSidebar);
  // 引き出しはヘッダーのハンバーガーメニューから出す（同じ状態を見る）
  const drawer = useChatLibraryStore((state) => state.drawerOpen);
  const setDrawer = useChatLibraryStore((state) => state.setDrawerOpen);
  /**
   * 今の出来事が一覧の部品の中で起きたか。行のメニュー・確認ダイアログは本体の外（ポータル）に描くので
   * DOM の包含では見分けられない。React の出来事はポータルからも部品の親へ伝わるので、根で印を付け、
   * 後から届く document の購読で読んで外す
   */
  const inside = useRef(false);

  // 引き出しの外を押す・Esc で引っ込める（外の出来事の購読）。ハンバーガーメニューは自分で開け閉めする。
  // 一覧の中（メニュー・ダイアログを含む）の出来事では引っ込めない（押した項目ごと消えて効かなくなる）
  useEffect(() => {
    if (!drawer) return;
    // 出来事のはじめ（捕捉の段階）で印を空にする（途中で伝わりを止められても次に残さない）
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

  // 列と引き出しは同じ部品で描く。縮めたときは場所を取らず、本体の左端から重ねて滑り出させる
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
          {/* 幅は列と引き出しで同じ値（端末に残す） */}
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

/** 「新しい会話」・会話の一覧・置き場の切り替えとピン止め。欄は薄い地の色で塗る */
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
      {/* 新しい会話は一覧の行と同じ大きさで、欄の一番上に置く */}
      <div className="p-1 pb-0">
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
        {/* 書き出した会話の取り込みと、キャラクターカードから新しい会話を始める。下の一覧との間を 8px 空ける */}
        <button
          type="button"
          className={cn(chatRow({ active: false }), 'mb-2')}
          title={t('llm.sidebar.openFileTitle')}
          onClick={() => {
            onChosen();
            pickChatFile();
          }}
        >
          <FileUp className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{t('llm.sidebar.openFile')}</span>
        </button>
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
      {/* 右下にピン止め */}
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
