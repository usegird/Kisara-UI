import { t, type MessageKey } from '@/i18n';
import type { SocketGiveUp, SocketStatus } from '@/port/connection';
import { RECONNECT_ATTEMPTS, RUN_DROP_LIMIT } from '@/queue/reconnect-policy';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

export type ConnectionTone = 'off' | 'busy' | 'ok' | 'warn' | 'error';

export interface ConnectionStatusView {
  readonly tone: ConnectionTone;
  readonly label: string;
  readonly detail: string | null;
}

const SOCKET_TEXT = {
  connecting: 'connection.status.socket.connecting',
  open: 'connection.status.socket.open',
  reconnecting: 'connection.status.socket.reconnecting',
  closed: 'connection.status.socket.closed',
} as const satisfies Record<SocketStatus, MessageKey>;

function formatProgress(socketStatus: SocketStatus): string {
  return t('connection.status.progress', { state: t(SOCKET_TEXT[socketStatus]) });
}

function retryParams(attempt: number): { attempt: string; max: string } {
  return { attempt: String(attempt), max: String(RECONNECT_ATTEMPTS) };
}

const UNRESPONSIVE_FROM = 4;

export function retryCount(socketStatus: SocketStatus, attempt: number): string | null {
  if (socketStatus !== 'reconnecting' || attempt < UNRESPONSIVE_FROM) return null;
  return t('connection.status.retry', retryParams(attempt));
}

export function retryNotice(socketStatus: SocketStatus, attempt: number): string | null {
  if (retryCount(socketStatus, attempt) === null) return null;
  return t('connection.status.unresponsiveRetry', retryParams(attempt));
}

function formatGiveUp(reason: SocketGiveUp): string {
  return reason === 'drops'
    ? t('connection.status.progressDropped', { count: String(RUN_DROP_LIMIT) })
    : t('connection.status.progressGaveUp', { count: String(RECONNECT_ATTEMPTS) });
}

export function connectionStatusView(
  status: ConnectionStatus,
  socketStatus: SocketStatus,
  attempt = 0,
  gaveUp: SocketGiveUp = 'retries',
): ConnectionStatusView {
  switch (status) {
    case 'connecting':
      return { tone: 'busy', label: t('connection.status.connecting'), detail: null };
    case 'failed':
      return { tone: 'error', label: t('connection.status.failed'), detail: null };
    case 'connected':
      if (socketStatus === 'open') {
        return {
          tone: 'ok',
          label: t('connection.status.connected'),
          detail: formatProgress('open'),
        };
      }
      if (socketStatus === 'closed') {
        return {
          tone: 'error',
          label: t('connection.status.timeout'),
          detail: formatGiveUp(gaveUp),
        };
      }
      return {
        tone: 'warn',
        label: retryNotice(socketStatus, attempt) ?? t('connection.status.connected'),
        detail: formatProgress(socketStatus),
      };
    default:
      return { tone: 'off', label: t('connection.status.disconnected'), detail: null };
  }
}
