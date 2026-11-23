import { t } from '@/i18n';
import type { ChangeResult, OpenResult } from '@/store/chat/chat-library';

export function formatOpenResult(result: OpenResult): string | null {
  if (result === 'opened') return null;
  if (result === 'elsewhere') return t('llm.library.openElsewhere');
  if (result === 'missing') return t('llm.library.missing');
  if (result === 'broken') return t('llm.library.broken');
  return t('llm.library.failed');
}

export function formatChangeResult(result: ChangeResult): string | null {
  if (result === 'done') return null;
  if (result === 'elsewhere') return t('llm.library.busyElsewhere');
  if (result === 'streaming') return t('llm.library.busyStreaming');
  if (result === 'broken') return t('llm.library.broken');
  if (result === 'full') return t('llm.library.full');
  return t('llm.library.failed');
}
