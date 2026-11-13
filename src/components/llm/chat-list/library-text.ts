import { t } from '@/i18n';
import type { ChangeResult, OpenResult } from '@/store/chat/chat-library';

// ─────────────────────────────
// 残した会話の操作の結果の文。会話を開くダイアログと会話の右の列で使う。
// ─────────────────────────────

/** 開けなかった理由。開けたら null */
export function formatOpenResult(result: OpenResult): string | null {
  if (result === 'opened') return null;
  if (result === 'elsewhere') return t('llm.library.openElsewhere');
  if (result === 'missing') return t('llm.library.missing');
  if (result === 'broken') return t('llm.library.broken');
  return t('llm.library.failed');
}

/** 消す・名前を変える・複製する・クリアするができなかった理由。できたら null */
export function formatChangeResult(result: ChangeResult): string | null {
  if (result === 'done') return null;
  if (result === 'elsewhere') return t('llm.library.busyElsewhere');
  if (result === 'streaming') return t('llm.library.busyStreaming');
  if (result === 'broken') return t('llm.library.broken');
  if (result === 'full') return t('llm.library.full');
  return t('llm.library.failed');
}
