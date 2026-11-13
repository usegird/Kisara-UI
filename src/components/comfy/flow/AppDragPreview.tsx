import { useDndContext } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';

import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 掴んだアプリ入力の項目に付いてくる見出し付きの枠
// ─────────────────────────────

/** 掴んだ項目が付いてくるときの見出し（`useSortable` の data に載せる） */
interface AppDragData {
  readonly appDrag: { readonly index: string | null; readonly label: string; readonly row: string };
}

function isAppDragData(value: unknown): value is AppDragData {
  return isRecord(value) && 'appDrag' in value;
}

/**
 * 掴んだアプリ入力の項目。**見出し付きの枠**として付いてくる（元の枠に他の項目があれば元の枠は残る）。
 * この列の受け口の DragOverlay に置く。アプリ入力を掴んでいなければ何も出さない
 */
export function AppDragPreview(): React.ReactElement | null {
  const { active } = useDndContext();
  const data: unknown = active?.data.current;
  if (!isAppDragData(data)) return null;

  return (
    <section
      className="border-border bg-background w-56 rounded-md border p-2 text-xs opacity-90
        shadow-md"
    >
      <p className="text-foreground/70 mb-1 flex items-center gap-1 text-2xs">
        {data.appDrag.index === null ? null : (
          <span className="shrink-0 font-semibold tabular-nums">{data.appDrag.index}</span>
        )}
        <span className="min-w-0 truncate">{data.appDrag.label}</span>
      </p>
      <p className="text-foreground/80 flex items-center gap-1">
        <GripVertical className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{data.appDrag.row}</span>
      </p>
    </section>
  );
}
