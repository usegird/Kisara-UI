import { cva } from 'class-variance-authority';
import { useEffect, useRef, useState } from 'react';

import { ColumnDivider } from '@/components/ui/column-divider';
import { DockToggleButton } from '@/components/ui/dock-toggle-button';
import { HeightHandle } from '@/components/ui/height-handle';
import { PinButton } from '@/components/ui/pin-button';
import type { SideColumnKit } from '@/components/ui/side-column-kit';
import { SideColumnRail } from '@/components/ui/side-column-rail';
import { SideColumnTabs } from '@/components/ui/side-column-tabs';
import { widenFromShown, type ColumnKey } from '@/store/settings-fields/column-widths';
import {
  MAX_SIDE_PANEL_HEIGHT,
  MIN_SIDE_PANEL_HEIGHT,
} from '@/store/settings-fields/side-panel-height';
import { useSettingsStore, type SidePanelDock } from '@/store/use-settings-store';

// ─────────────────────────────
// 右の列の枠。幅・置き場所（右か下）・細い 1 行への縮め方を持ち、中身は種別の層が `kit` で渡す。
// 幅と置き場所は種別で分けない（切り替えても列が跳ねない）。矢印キーでの移動は Base UI の Tabs に任せる。
// ─────────────────────────────

// 列と引き出しは同じ枠で描く（縮めたときは行の上に重ねて滑り出させる。右に置くときは、固定したときと
// 同じく画面の右端・最上部から下端までに重ね、本体の幅は変えない）。
// 下に置いたとき、本体が潰れきらないよう見た目でも頭を押さえる（引き出しは行の上に出すので除く）。
// 引き出しは本体の上に重ねるので、独立した描画の層に分ける（幅を変えるたびに下の本体を塗り直さない）
// 置き方（relative / absolute）は出し方の側だけで決める。土台にも書くと、両方が付いて relative が勝ち、
// 引き出しが本体の幅を押し縮める
// 右に置くときは、外枠の 2 段（ヘッダーと本体）を subgrid で受け継ぐ。
// タブの段はヘッダーの段と同じ高さになり、中身の欄は本体と同じ段から始まる（数で合わせない）。
// 右の引き出しも浮かせず、縮めた行と同じ升に重ねて左へはみ出させる（段を受け継ぐため。配置の閉じ込め
// contain: layout は subgrid を切るので、下の引き出しにだけ掛ける）
const frame = cva('shrink-0', {
  variants: {
    dock: { right: 'min-w-min items-stretch', bottom: '' },
    rows: {
      subgrid: 'row-span-2 grid grid-cols-[auto_minmax(min-content,1fr)] grid-rows-subgrid',
      own: 'flex',
    },
    floating: {
      true: `bg-background animate-in z-30 shadow-lg animation-duration-150 will-change-transform
        motion-reduce:animate-none`,
      false: 'relative',
    },
  },
  compoundVariants: [
    { dock: 'bottom', floating: false, className: 'max-h-[85%]' },
    {
      dock: 'right',
      floating: true,
      className: 'slide-in-from-right relative col-start-1 row-start-1 justify-self-end',
    },
    {
      dock: 'bottom',
      floating: true,
      className: 'slide-in-from-bottom absolute inset-x-0 bottom-full [contain:layout_style]',
    },
  ],
});
const body = cva('relative min-w-0 flex-1 overflow-hidden', {
  // 右に置くときは画面の最上部から置くので、上の余白をヘッダーのタブと揃える（4px。選んでいる
  // タブの札の上端がヘッダーのタブの札の上端と同じ高さになる）。
  // 右は本体との境目の線を引かない（幅を変える境目は残す）。
  // 下に置くときは上端に本体との境目の線を引く（高さを変える境目）
  // 右の余白は本体のアプリ入力のカードの左（15px）と揃える。
  // 下の余白は、ComfyUI では本体の列の横に送るバーの上端（10px）、会話では入力欄の下（18px）と揃える
  // 左は幅を変える境目との間を 4px 空け、本体との隙間を会話の左の列と同じ 8px にする
  variants: {
    dock: { right: 'pt-1 pr-column-gutter pl-1', bottom: 'border-t' },
    bottomEdge: { scrollbar: '', input: '' },
    rows: { subgrid: 'row-span-2 grid grid-rows-subgrid', own: 'flex flex-col' },
  },
  compoundVariants: [
    { dock: 'right', bottomEdge: 'scrollbar', className: 'pb-2.5' },
    { dock: 'right', bottomEdge: 'input', className: 'pb-column-bottom' },
  ],
});

// 欄の下端の 1 行。左にピン止め、右に置き場所の切り替え（会話の左の列の下端と同じ作り）
const DOCK_ICON_CLASS = `text-muted-foreground hover:text-foreground hover:bg-muted ml-auto flex
  size-7 shrink-0 items-center justify-center rounded focus-visible:outline-2`;

/** 右の列の枠の props */
export interface SideColumnProps {
  /** 種別の層が渡す列の中身 */
  readonly kit: SideColumnKit;
}

/**
 * 縮めた行と引き出しの置き場。右では外枠の 2 段（ヘッダーと本体）を受け継ぎ、縮めた行の幅（36px）の
 * 1 列にする。引き出しはその升に重ねて左へはみ出させる（列の幅は広げない）
 */
const collapsedRoot = cva('shrink-0', {
  variants: {
    dock: {
      right: 'row-span-2 grid grid-cols-[2.25rem] grid-rows-subgrid',
      bottom: 'relative flex',
    },
  },
});

/**
 * 右の列。ピン止めしていれば列として、外していれば縮めた行と引き出しとして描く。
 * 出していないタブは**中身を描かず、枠も畳む**（基盤の Tabs は閉じる側の枠をしばらく残すので、
 * そのままだと 2 つ分の高さを取り合う）
 */
export function SideColumn({ kit }: SideColumnProps): React.ReactElement {
  const storedDock = useSettingsStore((state) => state.sidePanelDock);
  // 置き場所を選べない中身（会話）は右に固定する
  const dock: SidePanelDock = kit.dockable === false ? 'right' : storedDock;
  const collapsed = useSettingsStore((state) => state.sidePanelCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // 引き出しの外を押すか Esc で引っ込める（行と引き出しの中は除く）
  useEffect(() => {
    if (!collapsed || !drawerOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && container.current?.contains(target) === true) return;
      setDrawerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [collapsed, drawerOpen]);

  if (!collapsed) return <SideColumnFrame dock={dock} kit={kit} floating={false} />;

  const press = (value: string): void => {
    // 出している中身のアイコンをもう一度押したら引っ込める
    if (drawerOpen && kit.selected === value) {
      setDrawerOpen(false);
      return;
    }
    kit.onSelect(value);
    setDrawerOpen(true);
  };

  return (
    <div ref={container} className={collapsedRoot({ dock })}>
      <SideColumnRail dock={dock} kit={kit} open={drawerOpen} onPress={press} />
      {drawerOpen ? (
        <SideColumnFrame dock={dock} kit={kit} floating onPinned={() => setDrawerOpen(false)} />
      ) : null}
    </div>
  );
}

interface SideColumnFrameProps extends SideColumnProps {
  readonly dock: SidePanelDock;
  /** 縮めた行から滑り出させた引き出しか（ピン止めを外している） */
  readonly floating: boolean;
  /** 引き出しをピン止めして列に戻した */
  readonly onPinned?: (() => void) | undefined;
}

/** 列と引き出しの枠。境目・タブと中身・浮かせるアイコンを同じ形で描く */
function SideColumnFrame({
  dock,
  kit,
  floating,
  onPinned,
}: SideColumnFrameProps): React.ReactElement {
  const widthKey = kit.widthKey ?? 'queue';
  const width = useSettingsStore((state) => state.columnWidths[widthKey]);
  const resizeColumn = useSettingsStore((state) => state.resizeColumn);
  const setCollapsed = useSettingsStore((state) => state.setSidePanelCollapsed);
  const height = useSettingsStore((state) => state.sidePanelHeight);
  const setHeight = useSettingsStore((state) => state.setSidePanelHeight);
  // 最小幅は並べたタブの幅（中身で決まる）なので、持っている幅がそれより狭いことがある。
  // 広げるときは見えている幅から広げる（掴んだ瞬間の値を読むだけ。描くための測りではない）
  const frameElement = useRef<HTMLDivElement>(null);
  const resizeShown = (column: ColumnKey, delta: number): void => {
    const shown = frameElement.current?.offsetWidth ?? 0;
    const current = useSettingsStore.getState().columnWidths[column];
    resizeColumn(column, widenFromShown(current, shown, delta));
  };
  const togglePin = (): void => {
    onPinned?.();
    setCollapsed(!floating);
  };
  // 右に置くときは外枠の段を受け継ぐ（引き出しも同じ）。下に置くときは自分の並び
  const rows = dock === 'right' ? 'subgrid' : 'own';

  return (
    // 右に置いたときの最小幅は、折り返さずに並べたタブの幅
    <div
      ref={frameElement}
      // 引き出しは出しているタブの名前で読み上げる。置いた列は補足のランドマークにする
      // （ランドマークの外に中身を置かない）
      role={floating ? 'region' : 'complementary'}
      aria-label={
        floating
          ? (kit.sections.find((section) => section.value === kit.selected)?.label ?? kit.label)
          : kit.label
      }
      style={dock === 'right' ? { width } : { height }}
      className={frame({ dock, floating, rows })}
    >
      {/* 右では左端の境目で幅を変える（2 段にまたがる）。下では帯の上端の線で高さを変える */}
      {dock === 'right' ? (
        <div className="row-span-2 flex">
          <ColumnDivider
            column={widthKey}
            label={kit.label}
            width={width}
            side="right"
            onResize={resizeShown}
          />
        </div>
      ) : null}

      <div className={body({ dock, bottomEdge: kit.bottomEdge ?? 'scrollbar', rows })}>
        {/* 帯の上端の線（本体との境目）を掴んで高さを変える。上へ動かすと伸びる。
            高さ 0 の置き場の上端＝線の直下に、掴みを線をまたぐように重ねる */}
        {dock === 'bottom' ? (
          <div className="relative h-0 shrink-0">
            <HeightHandle
              label={kit.label}
              height={height}
              min={MIN_SIDE_PANEL_HEIGHT}
              max={MAX_SIDE_PANEL_HEIGHT}
              edge="top"
              onChange={setHeight}
            />
          </div>
        ) : null}
        <SideColumnTabs
          dock={dock}
          rows={rows}
          kit={kit}
          pin={<PinButton pinned={!floating} onToggle={togglePin} />}
          attachPanel={floating ? undefined : kit.attachPanel}
          attachTabs={floating ? undefined : kit.attachTabs}
          dockToggle={
            kit.dockable === false ? null : <DockToggleButton className={DOCK_ICON_CLASS} />
          }
        />
      </div>
    </div>
  );
}
