import { useState } from 'react';

import { useOutputSrc } from '@/hooks/run/use-output-src';
import { useNearView } from '@/hooks/ui/use-near-view';
import type { OutputFileRef } from '@/port/files';

export interface OutputImageProps {
  readonly file: OutputFileRef;
  readonly baseUrl: string;
  readonly className?: string | undefined;
  readonly fallback?: React.ReactNode;
  readonly order?: number | undefined;
  readonly until?: number | undefined;
}

export function OutputImage({
  file,
  baseUrl,
  className,
  fallback = null,
  order,
  until,
}: OutputImageProps): React.ReactElement | null {
  const { attachTarget, near } = useNearView();
  const src = useOutputSrc(baseUrl, file, { order, until, enabled: near });
  const [gone, setGone] = useState(false);

  if (!near) return <span ref={attachTarget} className="block size-px" aria-hidden />;
  if (gone || src === false) return <>{fallback}</>;
  if (src === null) return null;

  return (
    <img
      className={className}
      src={src}
      alt={file.filename}
      loading="lazy"
      onError={() => setGone(true)}
    />
  );
}
