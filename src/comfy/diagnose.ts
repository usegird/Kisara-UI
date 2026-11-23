import type { Reachability } from '@/comfy/health';
import { isPrivateHost } from '@/lib/remote-host';
import type { ConnectionDiagnosis, RequestFailure } from '@/port/connection';

export interface PageContext {
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
