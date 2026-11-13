import { NO_SEMANTIC_HITS, type SemanticHits } from '@/chat/semantic';
import { useSemanticStore } from '@/store/use-semantic-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// プロンプトのタブの見込みに出す近似判定の当たり。計算は use-chat-store が行い、ここは結果を読むだけ。
// ─────────────────────────────

/** 会話の近似判定の当たりを返す。近似判定を切っている・モデルを読み終えていないときは空 */
export function useSemanticPreview(chatId: string): SemanticHits {
  const enabled = useSettingsStore((state) => state.loreSemantic);
  const ready = useSemanticStore((state) => state.status === 'ready');
  const hits = useSemanticStore((state) => state.previews[chatId]?.hits);
  return enabled && ready ? (hits ?? NO_SEMANTIC_HITS) : NO_SEMANTIC_HITS;
}
