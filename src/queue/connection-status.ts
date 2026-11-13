import { t, type MessageKey } from '@/i18n';
import type { SocketGiveUp, SocketStatus } from '@/port/connection';
import { RECONNECT_ATTEMPTS, RUN_DROP_LIMIT } from '@/queue/reconnect-policy';

// ─────────────────────────────
// 接続ステータスの見せ方。HTTP の疎通と進捗 WebSocket は別物なので、繋がっているのに進捗だけ
// 来ない状態が分かるようにまとめる。判定だけをここに置き、色は cva、文言は表示側が使う。
// ─────────────────────────────

/** HTTP の疎通の状態。持つのは接続のストア */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed';

/** 接続の状況の色合い */
export type ConnectionTone = 'off' | 'busy' | 'ok' | 'warn' | 'error';

/** 接続の状況の見せ方（色合い・見出し・補足） */
export interface ConnectionStatusView {
  readonly tone: ConnectionTone;
  readonly label: string;
  /** 補足（進捗チャンネルの状態など）。無ければ null */
  readonly detail: string | null;
}

const SOCKET_TEXT = {
  connecting: 'connection.status.socket.connecting',
  open: 'connection.status.socket.open',
  reconnecting: 'connection.status.socket.reconnecting',
  closed: 'connection.status.socket.closed',
} as const satisfies Record<SocketStatus, MessageKey>;

/** 「進捗: 受信中」 */
function formatProgress(socketStatus: SocketStatus): string {
  return t('connection.status.progress', { state: t(SOCKET_TEXT[socketStatus]) });
}

function retryParams(attempt: number): { attempt: string; max: string } {
  return { attempt: String(attempt), max: String(RECONNECT_ATTEMPTS) };
}

/**
 * 何回目の張り直しから「応答なし」と出すか。
 * それより前は一瞬の切れとして、再接続中とだけ出す
 */
const UNRESPONSIVE_FROM = 4;

/** 張り直しの途中なら「リトライ (4/10)」（タスクのカードに添える）。まだ騒がない回数なら null */
export function retryCount(socketStatus: SocketStatus, attempt: number): string | null {
  if (socketStatus !== 'reconnecting' || attempt < UNRESPONSIVE_FROM) return null;
  return t('connection.status.retry', retryParams(attempt));
}

/** 接続の状況に出す「応答なしリトライ (4/10)」。まだ騒がない回数なら null */
export function retryNotice(socketStatus: SocketStatus, attempt: number): string | null {
  if (retryCount(socketStatus, attempt) === null) return null;
  return t('connection.status.unresponsiveRetry', retryParams(attempt));
}

/** 張り直しを諦めた理由ごとの補足（何回で諦めたか） */
function formatGiveUp(reason: SocketGiveUp): string {
  return reason === 'drops'
    ? t('connection.status.progressDropped', { count: String(RUN_DROP_LIMIT) })
    : t('connection.status.progressGaveUp', { count: String(RECONNECT_ATTEMPTS) });
}

/** HTTP の疎通と通知の口の状態を合わせて、接続の状況の見せ方を決める */
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
      // HTTP は通っているが進捗が来ない状態を「接続済み」で塗り潰さない
      if (socketStatus === 'open') {
        return {
          tone: 'ok',
          label: t('connection.status.connected'),
          detail: formatProgress('open'),
        };
      }
      // 再接続を諦めた＝もう届かない。再接続中と同じ色にしない
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
