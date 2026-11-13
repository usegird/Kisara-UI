import { useDndMonitor } from '@dnd-kit/core';
import { useState } from 'react';

import { droppedGroups, parseAppInputDragId, type AppInputGroup } from '@/graph/app-input-order';

// ─────────────────────────────
// アプリ入力の列の掴んでいる項目と、落とす先へ置き直した枠の並び
// ─────────────────────────────

/** 掴んでいるアプリ入力の項目と、重ねている先 */
type AppDrag = { readonly active: string; readonly over: string | null } | null;

/**
 * 掴んでいる項目と重ねている先。
 *
 * ドラッグの状態は購読しない。まるごと受けると、ポインタが動くたびに
 * 列全体が描き直しになる。始まり・重ねた先・終わりだけを知らせで受けて手元で控える
 */
export function useAppDrag(): AppDrag {
  const [drag, setDrag] = useState<AppDrag>(null);
  const clear = (): void => setDrag(null);
  useDndMonitor({
    onDragStart: ({ active }) => {
      if (parseAppInputDragId(active.id) !== null)
        setDrag({ active: String(active.id), over: null });
    },
    onDragOver: ({ active, over }) => {
      if (parseAppInputDragId(active.id) === null) return;
      const overId = over ? String(over.id) : null;
      setDrag((prev) =>
        prev?.active === String(active.id) && prev.over === overId
          ? prev
          : { active: String(active.id), over: overId },
      );
    },
    onDragEnd: clear,
    onDragCancel: clear,
  });
  return drag;
}

/** 掴んでいる間に見せる枠の並び（落とす先へ置き直したもの）。掴んでいなければそのまま */
export function shownGroups(
  groups: readonly AppInputGroup[],
  drag: AppDrag,
): readonly AppInputGroup[] {
  const from = parseAppInputDragId(drag?.active);
  const to = parseAppInputDragId(drag?.over);
  return from && to ? droppedGroups(groups, from, to) : groups;
}
