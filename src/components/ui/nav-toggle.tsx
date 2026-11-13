import { Menu } from 'lucide-react';

// ─────────────────────────────
// ヘッダーのロゴの左のハンバーガーメニュー。押したときに何を開くかは、タブの種別の層が渡す。
// ─────────────────────────────

/**
 * 一覧の外を押したかを見るときに除く印。開いた一覧の「外を押したら閉じる」は、この印の付いた
 * ボタンを外に数えない（押したボタンが自分で開け閉めする）
 */
export const NAV_TOGGLE_MARK = 'data-nav-toggle';

/** ハンバーガーメニューの props */
export interface NavToggleProps {
  /** 読み上げの名前（開く一覧の名前） */
  readonly label: string;
  /** 一覧を出しているか（読み上げに知らせる） */
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

/** 一覧を開け閉めするボタン */
export function NavToggle({ label, expanded, onToggle }: NavToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      // 押せる大きさは 24px（WCAG 2.5.8）。ロゴの字の並びに目で合うよう 1px 下げる
      className="text-muted-foreground hover:text-foreground hover:bg-muted relative top-px flex
        size-6 shrink-0 items-center justify-center rounded focus-visible:outline-2"
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      onClick={onToggle}
      {...{ [NAV_TOGGLE_MARK]: '' }}
    >
      <Menu className="size-4" aria-hidden />
    </button>
  );
}
