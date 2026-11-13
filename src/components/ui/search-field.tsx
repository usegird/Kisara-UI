import { Search } from 'lucide-react';

import { dialogControl } from '@/components/ui/dialog-control';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// 絞り込みの入力欄。**どの一覧も同じ見た目**にする。基盤の入力欄（cmdk の `Command.Input` など）を
// 使う一覧は `SearchBox` で包んで入力に `SEARCH_INPUT_CLASS` を付け、素の入力なら `SearchField` を使う。
// ─────────────────────────────

/** 欄の中の入力に付ける見た目 */
export const SEARCH_INPUT_CLASS =
  'placeholder:text-muted-foreground w-full min-w-0 bg-transparent text-sm outline-none';

/** 虫眼鏡つきの欄の props */
export interface SearchBoxProps {
  readonly className?: string | undefined;
  readonly children: React.ReactNode;
}

/** 虫眼鏡つきの欄。中身の入力は呼び出し側が置く */
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

/** 絞り込みの入力欄の props */
export interface SearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** 読み上げの名前（「〜を絞り込む」） */
  readonly label: string;
  readonly placeholder: string;
  readonly autoFocus?: boolean | undefined;
  readonly className?: string | undefined;
}

/** 虫眼鏡つきの欄に素の入力を置いた、絞り込みの入力欄 */
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
        // 開いたときに打ち始められるように（ダイアログの最初の入力欄）
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
