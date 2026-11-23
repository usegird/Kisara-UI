import { NO_SEMANTIC_HITS, type SemanticHits } from '@/chat/semantic';
import { useSemanticStore } from '@/store/use-semantic-store';
import { useSettingsStore } from '@/store/use-settings-store';

export function useSemanticPreview(chatId: string): SemanticHits {
  const enabled = useSettingsStore((state) => state.loreSemantic);
  const ready = useSemanticStore((state) => state.status === 'ready');
  const hits = useSemanticStore((state) => state.previews[chatId]?.hits);
  return enabled && ready ? (hits ?? NO_SEMANTIC_HITS) : NO_SEMANTIC_HITS;
}
