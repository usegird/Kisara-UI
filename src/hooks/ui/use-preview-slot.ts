import { useEffect, useRef, useState } from 'react';

import { createSlotQueue } from '@/lib/slot-queue';

const PREVIEW_SLOT_COUNT = 4;
const PREVIEW_SLOTS = createSlotQueue(PREVIEW_SLOT_COUNT);

export function holdPreviewSlots(): () => void {
  return PREVIEW_SLOTS.hold();
}

interface PreviewSlot {
  readonly granted: boolean;
  readonly release: () => void;
}

export function usePreviewSlot(src: string | null): PreviewSlot {
  const [grantedSrc, setGrantedSrc] = useState<string | null>(null);
  const release = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (src === null) return;
    const giveBack = PREVIEW_SLOTS.request(() => setGrantedSrc(src));
    release.current = giveBack;
    return giveBack;
  }, [src]);

  return { granted: src !== null && grantedSrc === src, release: () => release.current() };
}
