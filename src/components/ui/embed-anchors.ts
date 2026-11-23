import { createContext, use } from 'react';

import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { useDialogStore } from '@/store/use-dialog-store';

type EmbedAnchorKey = 'chat' | 'chatColumn' | 'side' | 'sideTabs' | 'comfyHost';

export const EmbedAnchorsContext = createContext<AnchorRegistry | null>(null);

export function useEmbedAnchors(): AnchorRegistry | null {
  return use(EmbedAnchorsContext);
}

export function useEmbedAnchor(
  key: EmbedAnchorKey,
): ((element: HTMLElement | null) => void) | undefined {
  return use(EmbedAnchorsContext)?.register(key);
}

export function useEmbedTarget(key: EmbedAnchorKey): (element: HTMLElement | null) => void {
  const anchors = use(EmbedAnchorsContext);
  const setEmbedHost = useDialogStore((state) => state.setEmbedHost);
  return anchors?.register(key) ?? setEmbedHost;
}
