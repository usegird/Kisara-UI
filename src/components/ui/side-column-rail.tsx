import { cva } from 'class-variance-authority';

import { DockToggleButton } from '@/components/ui/dock-toggle-button';
import type { SideColumnKit } from '@/components/ui/side-column-kit';
import { cn } from '@/lib/utils';
import type { SidePanelDock } from '@/store/use-settings-store';

// ─────────────────────────────
// 縮めた右の列の行。押すとそのタブを選んで引き出しを出す（引き出しは `SideColumn` の枠で描く）。
// ─────────────────────────────

const rail = cva('bg-background relative flex shrink-0 items-center gap-1', {
  variants: {
    dock: {
      // 上はヘッダーのタブの札の上端（4px）に揃える（右の列は画面の最上部から置く）。
      // 外枠の 2 段にまたがり、引き出しと同じ升に置く
      right: 'col-start-1 row-span-2 row-start-1 w-9 flex-col pt-1 pb-2',
      // 下は幅いっぱいに伸ばし、境目の線を端から端まで引く（切り替えのアイコンが右端に寄る）
      bottom: 'h-9 flex-1 flex-row border-t px-2',
    },
  },
});

const railButton = cva(
  `relative flex size-7 shrink-0 items-center justify-center rounded focus-visible:outline-2`,
  {
    variants: {
      active: { true: 'bg-muted text-foreground', false: 'text-muted-foreground hover:bg-muted' },
      alert: {
        // タブと同じく下端の太い線で示す（railButton は relative）
        error: `text-destructive after:bg-destructive after:absolute after:inset-x-1
          after:bottom-0 after:h-[3px] after:rounded-full`,
        warning: `text-foreground after:bg-warning after:absolute after:inset-x-1 after:bottom-0
          after:h-[3px] after:rounded-full`,
        none: '',
      },
    },
  },
);

// 置き場所の切り替えは行の端（右なら下端、下なら右端）へ寄せる
const railEnd = cva('', { variants: { dock: { right: 'mt-auto', bottom: 'ml-auto' } } });

/** 縮めた行の props */
export interface SideColumnRailProps {
  readonly dock: SidePanelDock;
  /** 種別の層が渡した列の中身 */
  readonly kit: SideColumnKit;
  /** 引き出しを出しているか */
  readonly open: boolean;
  /** アイコンを押した（出している中身のアイコンなら引っ込める） */
  readonly onPress: (value: string) => void;
}

/** タブと同じ順のアイコンと、行の端の置き場所の切り替えを並べた細い 1 行 */
export function SideColumnRail({
  dock,
  kit,
  open,
  onPress,
}: SideColumnRailProps): React.ReactElement {
  // 右の引き出しを出している間は、アイコンの行を隠す（引き出しが行を覆う）
  const hidden = dock === 'right' && open ? 'invisible' : undefined;
  return (
    <div
      className={rail({ dock })}
      role="toolbar"
      aria-label={kit.label}
      aria-orientation={dock === 'right' ? 'vertical' : 'horizontal'}
    >
      {kit.sections.map((section) => (
        <button
          key={section.value}
          type="button"
          aria-label={section.label}
          title={section.label}
          aria-expanded={open && kit.selected === section.value}
          className={cn(
            railButton({
              active: open && kit.selected === section.value,
              alert: section.alert ?? 'none',
            }),
            hidden,
          )}
          onClick={() => onPress(section.value)}
        >
          {kit.renderRailIcon(section.value)}
        </button>
      ))}

      {/* 置き場所の切り替えも縮めたまま使える（行の端。選べない中身では出さない） */}
      {kit.dockable === false ? null : (
        <DockToggleButton
          className={cn(railButton({ active: false, alert: 'none' }), railEnd({ dock }), hidden)}
        />
      )}
    </div>
  );
}
