import { cva } from 'class-variance-authority';
import { CirclePlus } from 'lucide-react';

import { MENU_ACTION } from '@/lib/menu-actions';

// ─────────────────────────────
// 繋がずにノードを足す ⊕。カードの間と列の末尾で共用する。
// ─────────────────────────────

const addNodeButton = cva(
  'bg-background text-muted-foreground hover:text-foreground rounded-full transition-opacity',
  {
    variants: {
      /** `hover`: 親の `group/gap` に乗せたとき（と焦点が当たったとき）だけ出す */
      shown: {
        always: '',
        hover: 'opacity-0 group-hover/gap:opacity-100 focus:opacity-100',
      },
    },
  },
);

/** ノードを足す ⊕ の受け取り物 */
export interface AddNodeButtonProps {
  /** 読み上げる名前 */
  readonly label: string;
  /** 指したときに出す説明 */
  readonly title: string;
  readonly shown: 'always' | 'hover';
  readonly onClick: () => void;
  /**
   * Tab で止めず、キーボードで開くメニューから届くようにする（カードの上の ⊕）
   */
  readonly menuAction?: boolean | undefined;
}

/** ⊕ のアイコンのボタンを出す */
export function AddNodeButton({
  label,
  title,
  shown,
  onClick,
  menuAction = false,
}: AddNodeButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={addNodeButton({ shown })}
      aria-label={label}
      title={title}
      onClick={onClick}
      {...(menuAction ? MENU_ACTION : {})}
    >
      <CirclePlus className="size-4" aria-hidden />
    </button>
  );
}
