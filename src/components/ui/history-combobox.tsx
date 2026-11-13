import { Autocomplete } from '@base-ui/react/autocomplete';
import { cva } from 'class-variance-authority';
import { ChevronDown, X } from 'lucide-react';
import { useState } from 'react';

import { MENU_ITEM_CLASS } from '@/components/ui/menu-item';
import { t } from '@/i18n';
import { insertAtCaret } from '@/lib/insert-at-caret';
import { entryKeyOf } from '@/lib/text-entry';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// 打ち込める一覧つきの欄。接続先やモデルの名前を、打ち込むか履歴・一覧から選ぶ。
// 開閉・矢印キー・選んだ行の読み上げは Base UI の Autocomplete に任せる。
// ─────────────────────────────

/** 一覧つきの欄の props */
export interface HistoryComboboxProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** 一覧（新しい順など、出す順で） */
  readonly items: readonly string[];
  /** 欄の名前（読み上げ） */
  readonly label: string;
  readonly placeholder?: string | undefined;
  /** 空の欄で Tab を押したときに入れる例 */
  readonly example?: string | undefined;
  readonly title?: string | undefined;
  /** 選んだ行が無いときの Enter（つなぐ等） */
  readonly onEnter?: (() => void) | undefined;
  /** 一覧の行を選んだ（打ち込みでなく）。`onValueChange` の後に呼ぶ */
  readonly onPick?: ((item: string) => void) | undefined;
  /** 一覧から 1 件消す。渡したときだけ × を出す */
  readonly onRemove?: ((item: string) => void) | undefined;
  /** 欄の見た目（幅・文字の大きさ）。枠と余白は共通 */
  readonly className?: string | undefined;
  /** 枠線と地の色を付けない（色を付けた欄の中に置くとき。会話の入力欄の横のモデル） */
  readonly bare?: boolean | undefined;
  /**
   * 一覧の一番下に、線で区切っていつも出す行（新しく作成する・ファイルから開く等）。打ち込んでも
   * 絞らず、選ぶと欄の中身は変えずに `onSelect` を呼ぶ
   */
  readonly actions?: readonly HistoryComboboxAction[] | undefined;
}

/** 一覧の一番下にいつも出す行 */
interface HistoryComboboxAction {
  readonly label: string;
  readonly onSelect: () => void;
}

/** 一番下の行の値の頭（一覧の名前に使われない形）。後ろに行の番号を付ける */
const ACTION_PREFIX = ':history-combobox:action:';

/** 一番下の行。最初の行の上にだけ線を引く */
const actionItem = cva('', {
  variants: { first: { true: 'border-border mt-1 border-t', false: '' } },
});

/** 一番下の行の番号。一覧の名前なら null */
function actionIndex(value: string): number | null {
  return value.startsWith(ACTION_PREFIX) ? Number(value.slice(ACTION_PREFIX.length)) : null;
}

const input = cva('w-full min-w-0 rounded-md py-1 pr-7 pl-2', {
  variants: {
    bare: {
      // 中身の幅まで詰め、右に寄せる（会話の入力欄の横のモデル）
      true: `hover:bg-background/60 focus:bg-background field-sizing-content w-auto max-w-full
        bg-transparent text-right outline-none focus-visible:outline-1 focus-visible:outline-ring`,
      false: 'border-input bg-background border',
    },
  },
});

const ITEM = `group/item ${MENU_ITEM_CLASS}`;

/**
 * 一覧つきの欄。開いたときは欄の中身にかかわらず全部を出し、打ち込んだときだけ絞る
 * （ブラウザの datalist は欄の中身で絞るので、選んだ後に一覧が消えたように見える）
 */
export function HistoryCombobox({
  value,
  onValueChange,
  items,
  label,
  placeholder,
  example,
  title,
  onEnter,
  onPick,
  onRemove,
  className,
  bare = false,
  actions = [],
}: HistoryComboboxProps): React.ReactElement {
  // 開いてから打ち込んだか。打ち込むまでは全部を出す
  const [typed, setTyped] = useState(false);
  const [highlighted, setHighlighted] = useState<string | undefined>(undefined);
  const query = value.trim().toLowerCase();
  const matched =
    typed && query.length > 0 ? items.filter((item) => item.toLowerCase().includes(query)) : items;
  // 一番下の 1 行は絞らずにいつも出す
  const actionValues = actions.map((_, index) => `${ACTION_PREFIX}${index}`);
  const all = [...items, ...actionValues];
  const shown = [...matched, ...actionValues];

  return (
    // 基盤が置く隠れた input も枠の中に収める（並びの隙間に入り込まないように）
    <div className={cn('relative inline-flex min-w-0 items-center', className)}>
      <Autocomplete.Root
        items={[...all]}
        filteredItems={[...shown]}
        value={value}
        openOnInputClick
        onOpenChange={(open) => {
          if (open) setTyped(false);
        }}
        onValueChange={(next, details) => {
          const index = actionIndex(next);
          if (index !== null) {
            actions[index]?.onSelect();
            return;
          }
          if (details.reason === 'input-change') setTyped(true);
          onValueChange(next);
          if (details.reason === 'item-press') onPick?.(next);
        }}
        onItemHighlighted={(item) => setHighlighted(typeof item === 'string' ? item : undefined)}
      >
        <Autocomplete.Input
          className={input({ bare })}
          placeholder={placeholder}
          aria-label={label}
          title={title}
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(event) => {
            if (event.key === 'Tab' && !event.shiftKey && value.length === 0 && example) {
              // 空のときだけ例を入れて留まる。入っていれば Tab はふだんどおり次へ進む。
              // 打ったのと同じ編集として入れ、Ctrl+Z で戻せるようにする（insert-at-caret）
              event.preventDefault();
              if (!insertAtCaret(event.currentTarget, example)) onValueChange(example);
              return;
            }
            if (event.key === 'Delete' && event.shiftKey && highlighted && onRemove) {
              event.preventDefault();
              onRemove(highlighted);
              return;
            }
            if (entryKeyOf(event) === 'commit' && highlighted === undefined && onEnter) {
              event.preventDefault();
              onEnter();
            }
          }}
        />
        {all.length > 0 ? (
          <Autocomplete.Trigger
            className="text-muted-foreground hover:text-foreground absolute right-1 rounded p-0.5"
            aria-label={t('ui.combobox.open', { name: label })}
          >
            <ChevronDown className="size-3.5" aria-hidden />
          </Autocomplete.Trigger>
        ) : null}
        <Autocomplete.Portal>
          <Autocomplete.Positioner className="z-50 outline-none" sideOffset={4} align="start">
            <Autocomplete.Popup
              className="bg-popover text-popover-foreground max-h-72 w-(--anchor-width) min-w-48
              overflow-y-auto rounded-md border p-1 text-xs shadow-md outline-none"
            >
              <Autocomplete.List>
                {(item: string) =>
                  actionIndex(item) !== null ? (
                    <Autocomplete.Item
                      key={item}
                      value={item}
                      className={cn(ITEM, actionItem({ first: actionIndex(item) === 0 }))}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {actions[actionIndex(item) ?? 0]?.label}
                      </span>
                    </Autocomplete.Item>
                  ) : (
                    <Autocomplete.Item key={item} value={item} className={ITEM}>
                      <span className="min-w-0 flex-1 truncate">{item}</span>
                      {onRemove ? (
                        <button
                          type="button"
                          // 行の選び方は行そのもの（矢印キー）。消すのは Shift+Delete でもできるので Tab に載せない
                          tabIndex={-1}
                          className="text-muted-foreground hover:text-foreground rounded opacity-0
                        group-hover/item:opacity-100 group-data-highlighted/item:opacity-100"
                          aria-label={t('ui.combobox.remove', { item })}
                          title={t('ui.combobox.removeHint')}
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemove(item);
                          }}
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      ) : null}
                    </Autocomplete.Item>
                  )
                }
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>
    </div>
  );
}
