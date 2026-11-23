export interface DialogToolbarProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

export function DialogToolbar({ label, children }: DialogToolbarProps): React.ReactElement {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="box-content flex h-8 shrink-0 items-center gap-2 overflow-hidden border-b px-3
        text-xs"
    >
      {children}
    </div>
  );
}
