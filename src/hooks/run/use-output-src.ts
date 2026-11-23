import { useEffect, useEffectEvent } from 'react';

import type { OutputFileRef } from '@/port/files';
import { useConnectionStore } from '@/store/use-connection-store';
import { outputSrc, outputViewUrl, useOutputImagesStore } from '@/store/use-output-images-store';

export interface OutputSrcOptions {
  readonly order?: number | undefined;
  readonly until?: number | undefined;
  readonly enabled?: boolean | undefined;
}

export function useOutputSrc(
  baseUrl: string,
  file: OutputFileRef,
  { order, until, enabled = true }: OutputSrcOptions = {},
): string | null | false {
  const url = outputViewUrl(baseUrl, file);
  const src = useOutputImagesStore((state) =>
    url === null ? null : outputSrc(state.images, url, until),
  );
  const ensureImage = useOutputImagesStore((state) => state.ensure);
  const connected = useConnectionStore((state) => state.status === 'connected');

  const start = useEffectEvent((): void => {
    void ensureImage(baseUrl, file, { order, until });
  });
  useEffect(() => {
    if (enabled) start();
  }, [url, connected, enabled]);

  return src;
}
