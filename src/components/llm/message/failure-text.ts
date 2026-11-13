import { t, type MessageKey } from '@/i18n';
import { pageOrigin } from '@/lib/host';
import type { LlmFailure } from '@/port/llm-port';

// ─────────────────────────────
// 失敗の原因ごとの案内。次にやることが 1 つに決まる文にする。
// ─────────────────────────────

/** 差し込む値の無い案内 */
const PLAIN_FAILURE_TEXT: Readonly<
  Record<Exclude<LlmFailure['kind'], 'cors' | 'auth' | 'rejected' | 'server'>, MessageKey>
> = {
  stopped: 'llm.chat.stopped',
  consent: 'llm.failure.consent',
  unreachable: 'llm.failure.unreachable',
  'mixed-content': 'llm.failure.mixedContent',
  'not-found': 'llm.failure.notFound',
  'rate-limit': 'llm.failure.rateLimit',
  interrupted: 'llm.failure.interrupted',
  'bad-response': 'llm.failure.badResponse',
  paused: 'llm.failure.paused',
  'too-large': 'llm.failure.tooLarge',
  timeout: 'llm.failure.timeout',
  'response-too-large': 'llm.failure.responseTooLarge',
};

/** LLM の失敗を、原因に応じた案内の文にする */
export function formatLlmFailure(failure: LlmFailure): string {
  const status = String(failure.status ?? '');
  switch (failure.kind) {
    case 'cors':
      return t('llm.failure.cors', { origin: pageOrigin() });
    case 'auth':
      return t('llm.failure.auth', { status });
    case 'rejected':
      return failure.message !== undefined && failure.message.length > 0
        ? t('llm.failure.rejected', { message: failure.message })
        : t('llm.failure.rejectedPlain', { status });
    case 'server':
      return t('llm.failure.server', { status });
    default:
      return t(PLAIN_FAILURE_TEXT[failure.kind]);
  }
}
