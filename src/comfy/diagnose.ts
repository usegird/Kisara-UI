import type { Reachability } from '@/comfy/health';
import { isPrivateHost } from '@/lib/remote-host';
import type { ConnectionDiagnosis, RequestFailure } from '@/port/connection';

// ─────────────────────────────
// 到達失敗の原因を、ページの文脈と接続先の性質から推定してコードで返す（表示の文言は UI 側が持つ）。
// ─────────────────────────────

/** 原因の推定に使う、開いているページの文脈 */
export interface PageContext {
  /** 'http:' | 'https:' など。ブラウザ外では null */
  readonly protocol: string | null;
  readonly hostname: string | null;
  readonly online: boolean;
}

function targetHostname(targetUrl: string): string | null {
  try {
    return new URL(targetUrl).hostname;
  } catch {
    return null;
  }
}

function targetProtocol(targetUrl: string): string | null {
  try {
    return new URL(targetUrl).protocol;
  } catch {
    return null;
  }
}

/**
 * 失敗した要求から最も確からしい原因を推定する。ブラウザは CORS 拒否・Local Network Access 拒否・
 * 接続不能をすべて同じ TypeError にするので、例外だけでは切り分けられず、ページのプロトコル・
 * オンライン状態と接続先がプライベート IP かを見る。「CORS か未起動か」が残れば `cors-or-down`
 */
export function diagnoseFailure(
  error: Pick<RequestFailure, 'kind' | 'url' | 'status'>,
  page: PageContext,
): ConnectionDiagnosis {
  const targetUrl = error.url;
  const base = { targetUrl };

  if (error.kind === 'timeout') {
    return { ...base, code: 'timeout' };
  }
  if (error.kind === 'http') {
    const status = error.status ?? undefined;
    return status === undefined
      ? { ...base, code: 'http-error' }
      : { ...base, code: 'http-error', status };
  }
  if (error.kind === 'parse') {
    return { ...base, code: 'bad-response' };
  }
  if (error.kind === 'aborted') {
    return { ...base, code: 'unknown' };
  }

  if (!page.online) {
    return { ...base, code: 'offline' };
  }

  const protocol = targetProtocol(targetUrl);
  const hostname = targetHostname(targetUrl);

  if (page.protocol === 'https:' && protocol === 'http:') {
    return { ...base, code: 'mixed-content' };
  }

  const pageIsPrivate = page.hostname !== null && isPrivateHost(page.hostname);
  if (hostname !== null && isPrivateHost(hostname) && page.protocol !== null && !pageIsPrivate) {
    return {
      ...base,
      code: 'local-network',
    };
  }

  return {
    ...base,
    code: 'cors-or-down',
  };
}

/**
 * 「CORS か未起動か」の推定を、到達確認の結果で確定させる。
 * 他のコードはそのまま返す（到達確認は `cors-or-down` のときにしか行わない）。
 */
export function refineWithReachability(
  diagnosis: ConnectionDiagnosis,
  reachability: Reachability,
): ConnectionDiagnosis {
  if (diagnosis.code !== 'cors-or-down') return diagnosis;

  switch (reachability) {
    case 'reachable':
      return {
        ...diagnosis,
        code: 'cors',
      };
    case 'unreachable':
      return { ...diagnosis, code: 'down' };
    default:
      return diagnosis;
  }
}

/** ブラウザ外（テスト・Node）でも使えるように文脈取得を分離する */
export function currentPageContext(): PageContext {
  if (typeof globalThis.location === 'undefined') {
    return { protocol: null, hostname: null, online: true };
  }
  const online = typeof globalThis.navigator === 'undefined' ? true : globalThis.navigator.onLine;
  return {
    protocol: globalThis.location.protocol,
    hostname: globalThis.location.hostname,
    online,
  };
}
