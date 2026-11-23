import { ArrowLeftToLine } from 'lucide-react';

export interface InsertIconButtonProps {
  readonly label: string;
  readonly blocked: string | null;
  readonly onInsert: () => void;
}

export function InsertIconButton({
  label,
  blocked,
  onInsert,
}: InsertIconButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded-md p-1
        disabled:pointer-events-none disabled:opacity-40"
      aria-label={label}
      title={blocked ?? label}
      disabled={blocked !== null}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onInsert();
      }}
    >
      <ArrowLeftToLine className="size-3" aria-hidden />
    </button>
  );
}
