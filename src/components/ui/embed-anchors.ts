import { createContext, use } from 'react';

import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { useDialogStore } from '@/store/use-dialog-store';

// ─────────────────────────────
// 埋め込み先を測る台帳の受け渡し。外枠が台帳（`useAnchorRegistry`。測る仕組みはこれ 1 本）を持ち、
// 重ねる範囲の部品が登録する。測るのは重ねる側が原点を付けている間だけ。
// ─────────────────────────────

/** 登録する部品の鍵 */
type EmbedAnchorKey = 'chat' | 'chatColumn' | 'side' | 'sideTabs' | 'comfyHost';

/** 外枠が置く台帳を下へ渡す口。外枠の外では null */
export const EmbedAnchorsContext = createContext<AnchorRegistry | null>(null);

/** 外枠が置いた台帳。無ければ null */
export function useEmbedAnchors(): AnchorRegistry | null {
  return use(EmbedAnchorsContext);
}

/** 測ってほしい要素に付けるコールバック ref。台帳が無ければ何もしない */
export function useEmbedAnchor(
  key: EmbedAnchorKey,
): ((element: HTMLElement | null) => void) | undefined {
  return use(EmbedAnchorsContext)?.register(key);
}

/**
 * 元の嵌め先に付ける ref。外枠に台帳があれば範囲を測る印として登録し（嵌め先は外枠が置く）、
 * 無ければ（公開用のデモ）そのまま埋め込みの嵌め先にする
 */
export function useEmbedTarget(key: EmbedAnchorKey): (element: HTMLElement | null) => void {
  const anchors = use(EmbedAnchorsContext);
  const setEmbedHost = useDialogStore((state) => state.setEmbedHost);
  return anchors?.register(key) ?? setEmbedHost;
}
