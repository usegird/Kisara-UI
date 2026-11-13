import { Puzzle, Settings, SlidersHorizontal, SquareTerminal } from 'lucide-react';

import { ChatConnectionPanel } from '@/components/llm/side-panel/ChatConnectionPanel';
import { ChatExtensionPanel } from '@/components/llm/side-panel/ChatExtensionPanel';
import { ChatGenerationPanel } from '@/components/llm/side-panel/ChatGenerationPanel';
import { ChatPromptPanel } from '@/components/llm/side-panel/ChatPromptPanel';
import { useEmbedAnchor } from '@/components/ui/embed-anchors';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { SideColumn } from '@/components/ui/side-column';
import type { SideColumnKit } from '@/components/ui/side-column-kit';
import { t, type MessageKey } from '@/i18n';
import { useChatSidePanelStore, type ChatSidePanelTab } from '@/store/use-chat-side-panel-store';

// ─────────────────────────────
// 会話のタブの右の列。枠は ComfyUI のタブと共通（`ui/side-column`）で、中身のタブを渡す。
// ─────────────────────────────

const PANELS: readonly { readonly value: ChatSidePanelTab; readonly label: MessageKey }[] = [
  { value: 'prompt', label: 'llm.side.prompt' },
  { value: 'generation', label: 'llm.side.generation' },
  { value: 'extension', label: 'llm.side.extension' },
  { value: 'settings', label: 'llm.side.settings' },
];

function isPanel(value: string): value is ChatSidePanelTab {
  return PANELS.some((panel) => panel.value === value);
}

function RailIcon({ tab }: { readonly tab: ChatSidePanelTab }): React.ReactElement {
  if (tab === 'settings') return <Settings className="size-4" aria-hidden />;
  if (tab === 'generation') return <SlidersHorizontal className="size-4" aria-hidden />;
  if (tab === 'extension') return <Puzzle className="size-4" aria-hidden />;
  return <SquareTerminal className="size-4" aria-hidden />;
}

function PanelContent({
  tab,
  chatId,
}: {
  readonly tab: ChatSidePanelTab;
  readonly chatId: string;
}): React.ReactElement {
  const label = PANELS.find((panel) => panel.value === tab)?.label ?? 'llm.side.settings';
  return (
    <ErrorBoundary label={t('llm.side.tabBoundary', { name: t(label) })} resetKey={chatId}>
      {tab === 'settings' ? (
        <ChatConnectionPanel />
      ) : tab === 'generation' ? (
        <ChatGenerationPanel chatId={chatId} />
      ) : tab === 'extension' ? (
        <ChatExtensionPanel />
      ) : (
        <ChatPromptPanel chatId={chatId} />
      )}
    </ErrorBoundary>
  );
}

/** 会話のタブの右の列の props */
export interface ChatSidePanelProps {
  readonly chatId: string;
}

/** 会話のタブの右の列。拡張のほかのタブはアクティブな会話のものを出す */
export function ChatSidePanel({ chatId }: ChatSidePanelProps): React.ReactElement {
  const tab = useChatSidePanelStore((state) => state.tab);
  const setTab = useChatSidePanelStore((state) => state.setTab);
  const attachPanel = useEmbedAnchor('side');
  const attachTabs = useEmbedAnchor('sideTabs');

  const kit: SideColumnKit = {
    label: t('llm.side.label'),
    // 会話では下に置く切り替えを持たない（右に固定）
    dockable: false,
    bottomEdge: 'input',
    // 幅は ComfyUI の右の列と別に持つ
    widthKey: 'chatSide',
    // 画像ビューワーはこの列に重ねる（上端はタブの並びから）
    attachPanel,
    attachTabs,
    sections: PANELS.map((panel) => ({ value: panel.value, label: t(panel.label) })),
    selected: tab,
    onSelect: (value) => {
      if (isPanel(value)) setTab(value);
    },
    renderRailIcon: (value) => (isPanel(value) ? <RailIcon tab={value} /> : null),
    renderContent: (value) =>
      isPanel(value) ? <PanelContent tab={value} chatId={chatId} /> : null,
  };

  return <SideColumn kit={kit} />;
}
