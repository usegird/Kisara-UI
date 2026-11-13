import { cva } from 'class-variance-authority';
import { Triangle, type LucideIcon } from 'lucide-react';

import { dialogControl } from '@/components/ui/dialog-control';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// 並び替えの種類のアイコンと上下の三角。描くだけで、選んでいる種類と向きは呼び出し元が持つ。
// 文言（`modelPicker.sort.*`）はどの画面でも同じ。
// ─────────────────────────────

/**
 * 並び替えの種類のアイコン。選んでいるものを濃くする。押せる幅は 24px にする
 * （隣の三角は同じ働きをこのボタンで代えられる。WCAG 2.5.8 の例外）
 */
const sortIcon = cva(cn(dialogControl({ kind: 'choice' }), 'flex h-7 items-center px-1'), {
  variants: {
    active: {
      true: 'text-foreground',
      false: 'text-muted-foreground hover:text-foreground',
    },
  },
});

/** アイコンの右の上下の三角。今の並びの向きだけ濃くする */
const sortArrow = cva(
  'flex h-3 items-center rounded-sm px-0.5 focus-visible:outline-1 focus-visible:outline-ring',
  {
    variants: {
      on: {
        true: 'text-foreground',
        false: 'text-muted-foreground hover:text-foreground',
      },
    },
  },
);

/** 並び替えの種類 1 つ。`label` は訳した名前 */
export interface SortOption<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly Icon: LucideIcon;
}

/** 並び替えのボタンの並びの props */
export interface SortButtonsProps<K extends string> {
  readonly options: readonly SortOption<K>[];
  readonly sortKey: K;
  readonly ascending: boolean;
  readonly onSort: (key: K, ascending: boolean) => void;
}

/**
 * 並び替えの種類のボタンを並べる。種類どうしは詰めて並べ（帯の間隔より狭く）、続く欄とは少し空ける
 */
export function SortButtons<K extends string>({
  options,
  sortKey,
  ascending,
  onSort,
}: SortButtonsProps<K>): React.ReactElement {
  return (
    <span className="mr-1.5 flex items-center gap-1">
      {options.map((option) => (
        <SortButton
          key={option.key}
          option={option}
          active={option.key === sortKey}
          ascending={ascending}
          onSort={onSort}
        />
      ))}
    </span>
  );
}

/**
 * 並び替えの 1 種類。アイコンの右に上下の三角を常に出し、今の並びの三角を濃くする。
 * アイコンを押すとその種類に切り替える（選んでいるものなら昇降を入れ替える）。
 * 三角を押すとその種類をその向きで並べる
 */
function SortButton<K extends string>({
  option,
  active,
  ascending,
  onSort,
}: {
  readonly option: SortOption<K>;
  readonly active: boolean;
  readonly ascending: boolean;
  readonly onSort: (key: K, ascending: boolean) => void;
}): React.ReactElement {
  const label = active
    ? t(ascending ? 'modelPicker.sort.ascending' : 'modelPicker.sort.descending', {
        name: option.label,
      })
    : t('modelPicker.sort.pick', { name: option.label });
  const upLabel = t('modelPicker.sort.setAscending', { name: option.label });
  const downLabel = t('modelPicker.sort.setDescending', { name: option.label });
  return (
    <span className="flex h-7 items-center">
      <button
        type="button"
        className={sortIcon({ active })}
        aria-label={label}
        aria-pressed={active}
        title={label}
        onClick={() => onSort(option.key, active ? !ascending : true)}
      >
        <option.Icon className="size-4" aria-hidden />
      </button>
      <span className="flex flex-col">
        <button
          type="button"
          className={sortArrow({ on: active && ascending })}
          aria-label={upLabel}
          aria-pressed={active && ascending}
          title={upLabel}
          onClick={() => onSort(option.key, true)}
        >
          <Triangle className="size-2 fill-current" aria-hidden />
        </button>
        <button
          type="button"
          className={sortArrow({ on: active && !ascending })}
          aria-label={downLabel}
          aria-pressed={active && !ascending}
          title={downLabel}
          onClick={() => onSort(option.key, false)}
        >
          <Triangle className="size-2 rotate-180 fill-current" aria-hidden />
        </button>
      </span>
    </span>
  );
}
