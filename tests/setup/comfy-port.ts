import { beforeEach } from 'vitest';

import { installComfyPort } from '@/store/ports/comfy-port';
import { TERMS_REVISION, useTermsStore } from '@/store/use-terms-store';

// 通信の窓口を入口と同じ HTTP の実装で入れる。通信の関数は各テストが
// `vi.mock('@/comfy/...')` で差し替える。ここで静的に読むと差し替える前の本物を掴むので、
// テストのファイルの差し替えが済んだ後（各テストの前）に読む。
// 窓口は同意の関門で包まれる。通信を試すテストのために、既定は同意した状態にする
// （関門を試すテストは、その中で同意を外す）
beforeEach(async () => {
  const { createHttpPort } = await import('@/comfy/http-port');
  installComfyPort(createHttpPort());
  useTermsStore.setState({
    accepted: { revision: TERMS_REVISION, acceptedAt: '2026-10-15T00:00:00.000Z' },
    cloud: { acceptedAt: '2026-10-15T00:00:00.000Z' },
  });
});
