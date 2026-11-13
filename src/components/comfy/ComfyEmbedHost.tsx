import { useShallow } from 'zustand/react/shallow';

import { comfyEmbedRegion } from '@/components/comfy/embed-region';
import { useEmbedAnchors } from '@/components/ui/embed-anchors';
import { useAnchorRects } from '@/hooks/ui/use-anchor-registry';
import { useDialogStore } from '@/store/use-dialog-store';

// ─────────────────────────────
// ComfyUI のタブの埋め込みのダイアログの嵌め先。本体ははみ出した分を切り取るので、右の列まで
// 広げられるよう外枠に置き、範囲は元の嵌め先と右の列の中身の欄を測って決める（測る仕組みは 1 本）。
// ─────────────────────────────

/**
 * 埋め込みのダイアログの嵌め先を外枠に置く。外枠が ComfyUI のタブのときに置く。
 * 外枠に台帳が無い画面（公開用のデモ）では、元の嵌め先がそのまま嵌め先になる。
 */
export function ComfyEmbedHost(): React.ReactElement {
  const anchors = useEmbedAnchors();
  const setEmbedHost = useDialogStore((state) => state.setEmbedHost);
  const region = useAnchorRects(
    anchors,
    useShallow((rects) => comfyEmbedRegion(rects) ?? {}),
  );
  const measured = Object.keys(region).length > 0;
  return (
    // 測る原点（外枠いっぱい）。ComfyUI のタブを出している間だけ付ける
    <div ref={anchors?.attachContainer} className="pointer-events-none absolute inset-0 z-30">
      {/* 列のホイール・掴み・倍率は、重ねた画面の上では効かせない（元の嵌め先と同じ印） */}
      {measured ? (
        <div ref={setEmbedHost} data-flow-overlay className="absolute" style={region} />
      ) : null}
    </div>
  );
}
