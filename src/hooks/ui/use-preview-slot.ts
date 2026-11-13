import { useEffect, useRef, useState } from 'react';

import { createSlotQueue } from '@/lib/slot-queue';

// ─────────────────────────────
// 選ぶダイアログのカードの画像を読む順番待ち。
// ─────────────────────────────

/**
 * 画像に使う接続の数。ブラウザが 1 つの接続先へ同時に張る接続は HTTP/1.1 で 6 本なので、
 * 残りは取り込み・情報・メモの要求に空けておく。
 */
const PREVIEW_SLOT_COUNT = 4;
const PREVIEW_SLOTS = createSlotQueue(PREVIEW_SLOT_COUNT);

/** 画像を読み始めてよいかと、枠を返す手続き */
interface PreviewSlot {
  /** 読み始めてよいか。まだなら画像の要素を置かない */
  readonly granted: boolean;
  /** 読み終えた・読めなかった。枠を返す */
  readonly release: () => void;
}

/**
 * 画像を読む枠を順番待ちで頼む。枠は読み終えた・読めなかった・カードが消えたときに返す。
 * @param src - null（画像を持たない）なら枠を頼まない
 */
export function usePreviewSlot(src: string | null): PreviewSlot {
  // どの画像の枠か。画像が変わった瞬間は描画中に「まだ」へ落ちる
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
