import { useChatTabLabel } from '@/hooks/shell/use-chat-tab-label';
import { useWorkflowTabLabel } from '@/hooks/shell/use-workflow-tab-label';
import { useTabsStore, type TabLabel } from '@/store/use-tabs-store';

export function useTabLabel(id: string): TabLabel {
  const chat = useTabsStore((state) =>
    state.tabs.some((tab) => tab.id === id && tab.kind === 'chat'),
  );
  const workflow = useWorkflowTabLabel(id);
  const conversation = useChatTabLabel(id);
  return chat ? conversation : workflow;
}
