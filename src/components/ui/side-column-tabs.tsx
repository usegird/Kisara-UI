import { Tabs } from '@base-ui/react/tabs';
import { cva } from 'class-variance-authority';

import type { SideColumnKit } from '@/components/ui/side-column-kit';
import { cn } from '@/lib/utils';
import type { SidePanelDock } from '@/store/use-settings-store';

// ─────────────────────────────
// 右の列のタブの並びと中身の欄。
// ─────────────────────────────

/**
 * タブの見出し。失敗・注意は見出しの下の太い線で示す
 */
const tabLabel = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-sm whitespace-nowrap',
  {
    variants: {
      // 右は上に横並び、下は右端に縦並び
      dock: { right: '', bottom: '' },
      active: {
        true: 'bg-foreground/10 text-foreground font-medium',
        false: 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
      },
      // 下端に太い線を引く（塗りは選んでいるタブの札と紛れるので使わない）
      alert: {
        error: `text-destructive after:bg-destructive relative font-semibold after:absolute
          after:inset-x-1.5 after:bottom-0 after:h-[3px] after:rounded-full`,
        warning: `text-foreground after:bg-warning relative font-semibold after:absolute
          after:inset-x-1.5 after:bottom-0 after:h-[3px] after:rounded-full`,
        none: '',
      },
    },
  },
);

// タブと中身の並び。下に置いたときはタブを左端に置く
const tabsRoot = cva('min-h-0 flex-1', {
  variants: {
    dock: { right: 'flex-col', bottom: 'flex-row' },
    rows: { subgrid: 'row-span-2 grid grid-rows-subgrid', own: 'flex' },
  },
});

// タブの並び。右は上に横並びで折り返さない（列の最小幅を、並べたタブの幅にする）。
// 外枠の段を受け継ぐときはヘッダーの段の上に寄せ、受け継がない引き出しでは中身の欄との間を 8px 空ける。
// 下は左端に縦並び
const tabList = cva('flex', {
  variants: {
    dock: {
      right: 'shrink-0 items-center gap-0.5',
      bottom: 'min-w-[4.5rem] shrink-0 flex-col gap-0.5 pr-2',
    },
    // 格子の中では min-w-0 が最小幅を 0 にするので、タブを並べた幅を最小幅にする（列の最小幅になる）
    rows: { subgrid: 'min-w-max self-start', own: '' },
  },
  compoundVariants: [{ dock: 'right', rows: 'own', className: 'min-w-0 pb-2' }],
});

// 中身の欄は列の最小幅に入れない（最小幅はタブの並びで決める）。
// 欄は薄い地の色で塗って領域を示す（線は引かない）。ピン止めと置き場所の切り替えは、右に置くときは
// 下端の 1 行（ピン止めが左、切り替えが右）、下に置くときはピン止めを右上、切り替えを右下の角に置く。
// 外枠の段を受け継ぐときは本体の段に置き、本体の列と同じく上を 8px 空ける
// （本体の列の上の余白と同じ量。ComfyUI のアプリ入力・変数のカード、会話の左の列の上端と揃う）
const panelArea = cva(
  'bg-pane relative flex min-h-0 min-w-0 flex-1 flex-col rounded-md [contain:inline-size]',
  { variants: { rows: { subgrid: 'mt-2', own: '' } } },
);
const BOTTOM_PIN = 'absolute top-1 right-1 flex';
const BOTTOM_DOCK = 'absolute right-1 bottom-1 flex';

// 中身。下に置いたときは左端を 20px 空け、右上の角のアイコンの分だけ右を空ける
const panelBody = cva('min-h-0 min-w-0 overflow-y-auto p-2', {
  variants: {
    active: { true: 'flex-1', false: 'hidden' },
    dock: { right: '', bottom: 'pr-16 pl-5' },
  },
});

/** タブと中身の props */
export interface SideColumnTabsProps {
  /** 種別の層が渡す列の中身 */
  readonly kit: SideColumnKit;
  /** 置き場所。下ならタブを左端に縦に並べ、キューのカードを折り返して並べる */
  readonly dock: SidePanelDock;
  /** 外枠の段を受け継ぐか（右に固定しているとき） */
  readonly rows: 'subgrid' | 'own';
  /** ピン止め（右なら欄の下端の 1 行の左、下なら欄の右上の角） */
  readonly pin: React.ReactNode;
  /** 置き場所の切り替え（右なら欄の下端の 1 行の右、下なら欄の右下の角） */
  readonly dockToggle: React.ReactNode;
  /** 中身の欄とタブの並びに付ける ref（置いた列のときだけ。引き出しには付けない） */
  readonly attachPanel?: ((element: HTMLElement | null) => void) | undefined;
  readonly attachTabs?: ((element: HTMLElement | null) => void) | undefined;
}

/** タブと中身 */
export function SideColumnTabs({
  dock,
  rows,
  kit,
  pin,
  dockToggle,
  attachPanel,
  attachTabs,
}: SideColumnTabsProps): React.ReactElement {
  const list = (
    <Tabs.List ref={attachTabs} className={tabList({ dock, rows })} aria-label={kit.label}>
      {kit.sections.map((section) => (
        <Tabs.Tab
          key={section.value}
          value={section.value}
          // 選んでいても失敗・注意の塗りを優先する（重なる色は後ろの指定で上書き）
          className={cn(
            tabLabel({
              dock,
              active: kit.selected === section.value,
              alert: section.alert ?? 'none',
            }),
          )}
        >
          {section.label}
          {kit.renderTabExtra?.(section.value)}
        </Tabs.Tab>
      ))}
    </Tabs.List>
  );
  return (
    <Tabs.Root
      value={kit.selected}
      onValueChange={(value) => {
        const next = kit.sections.find((section) => section.value === value);
        if (next) kit.onSelect(next.value);
      }}
      orientation={dock === 'bottom' ? 'vertical' : 'horizontal'}
      className={tabsRoot({ dock, rows })}
    >
      {list}

      <div ref={attachPanel} className={panelArea({ rows })}>
        {kit.sections.map((section) => (
          <Tabs.Panel
            key={section.value}
            value={section.value}
            className={panelBody({ active: kit.selected === section.value, dock })}
          >
            {kit.selected !== section.value
              ? null
              : kit.renderContent(section.value, dock === 'bottom')}
          </Tabs.Panel>
        ))}
        {dock === 'right' ? (
          <div className="flex shrink-0 items-center gap-1 px-1 pb-1">
            {pin}
            {dockToggle}
          </div>
        ) : (
          <>
            <div className={BOTTOM_PIN}>{pin}</div>
            {dockToggle === null ? null : <div className={BOTTOM_DOCK}>{dockToggle}</div>}
          </>
        )}
      </div>
    </Tabs.Root>
  );
}
