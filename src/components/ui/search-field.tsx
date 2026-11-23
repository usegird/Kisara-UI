import { Search } from 'lucide-react';

import { dialogControl } from '@/components/ui/dialog-control';
import { cn } from '@/lib/utils';

export const SEARCH_INPUT_CLASS =
  'placeholder:text-muted-foreground w-full min-w-0 bg-transparent text-sm outline-none';

export interface SearchBoxProps {
  readonly className?: string | undefined;
  readonly children: React.ReactNode;
}

export function SearchBox({ className, children }: SearchBoxProps): React.ReactElement {
  return (
    <label
      className={cn(
        dialogControl({ kind: 'field' }),
        'flex min-w-0 flex-1 items-center gap-1.5 py-1 has-focus-visible:outline-1',
        'has-focus-visible:outline-ring',
        className,
      )}
    >
      <Search className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      {children}
    </label>
  );
}

export interface SearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly placeholder: string;
  readonly autoFocus?: boolean | undefined;
  readonly className?: string | undefined;
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  autoFocus = false,
  className,
}: SearchFieldProps): React.ReactElement {
  return (
    <SearchBox className={className}>
      <input
        autoFocus={autoFocus}
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        className={SEARCH_INPUT_CLASS}
        onChange={(event) => onChange(event.target.value)}
      />
    </SearchBox>
  );
}
