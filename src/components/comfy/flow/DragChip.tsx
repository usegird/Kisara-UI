export interface DragChipProps {
  readonly type: string;
  readonly value: string;
}

export function DragChip({ type, value }: DragChipProps): React.ReactElement {
  return (
    <span
      className="bg-muted/90 border-border pointer-events-none inline-flex max-w-56 items-center
        gap-2 rounded-full border px-2.5 py-0.5 text-2xs opacity-70 shadow-sm"
    >
      <span className="shrink-0 font-bold">{type}</span>
      {value.length > 0 ? <span className="min-w-0 truncate">{value}</span> : null}
    </span>
  );
}
