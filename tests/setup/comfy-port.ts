import { beforeEach } from 'vitest';

import { installComfyPort } from '@/store/ports/comfy-port';
import { TERMS_REVISION, useTermsStore } from '@/store/use-terms-store';

beforeEach(async () => {
  const { createHttpPort } = await import('@/comfy/http-port');
  installComfyPort(createHttpPort());
  useTermsStore.setState({
    accepted: { revision: TERMS_REVISION, acceptedAt: '2026-10-15T00:00:00.000Z' },
    cloud: { acceptedAt: '2026-10-15T00:00:00.000Z' },
  });
});
