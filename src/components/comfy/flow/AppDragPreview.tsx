import { useDndContext } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';

import { isRecord } from '@/lib/guards';

interface AppDragData {
  readonly appDrag: { readonly index: string | null; readonly label: string; readonly row: string };
}

function isAppDragData(value: unknown): value is AppDragData {
  return isRecord(value) && 'appDrag' in value;
}

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
