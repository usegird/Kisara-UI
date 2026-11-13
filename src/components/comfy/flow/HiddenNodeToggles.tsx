import { cva } from 'class-variance-authority';
import { SlidersHorizontal, StickyNote } from 'lucide-react';

import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 実行に関わらないノード（操作系・繋がっていない）を出すかどうかの切り替え。
// 文字は持たない（列の幅を食わないため）。
// ─────────────────────────────

const toggle = cva('hover:bg-muted rounded p-1 transition-opacity', {
  variants: {
    shown: {
      true: 'text-foreground opacity-90',
      // 隠しているかは斜線で見せる。アイコンは薄くしすぎない（WCAG 1.4.11）
      false: 'text-muted-foreground',
    },
  },
});

/** 出す・隠すの切り替え */
function ShowToggle({
  shown,
  label,
  shownTitle,
  hiddenTitle,
  icon: Icon,
  onChange,
}: {
  readonly shown: boolean;
  readonly label: string;
  /** 出しているときのホバー説明 */
  readonly shownTitle: string;
  /** 隠しているときのホバー説明 */
  readonly hiddenTitle: string;
  readonly icon: typeof StickyNote;
  readonly onChange: (shown: boolean) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-label={label}
      title={shown ? shownTitle : hiddenTitle}
      className={toggle({ shown })}
      onClick={() => onChange(!shown)}
    >
      <span className="relative block">
        <Icon className="size-4" aria-hidden />
        {/* 隠しているときの斜線（左下から右上へ） */}
        {shown ? null : (
          <span
            aria-hidden
            className="absolute top-1/2 left-1/2 h-px w-[22px] -translate-1/2 -rotate-45
              bg-current"
          />
        )}
      </span>
    </button>
  );
}

/** 操作系と繋がっていないノードの、出す・隠すの切り替えを縦に並べる */
export function HiddenNodeToggles(): React.ReactElement {
  const control = useSettingsStore((state) => state.showControlNodes);
  const setControl = useSettingsStore((state) => state.setShowControlNodes);
  const unlinked = useSettingsStore((state) => state.showUnlinkedNodes);
  const setUnlinked = useSettingsStore((state) => state.setShowUnlinkedNodes);
  // 切り替えたときにだけ、隠す相手を今の線で決め直す（編集では増やさない）
  const refresh = useTabsStore((state) => state.refreshHiddenCandidates);

  return (
    <div className="flex flex-col gap-0.5">
      <ShowToggle
        shown={control}
        label={t('flow.toggles.controlLabel')}
        shownTitle={t('flow.toggles.controlShown')}
        hiddenTitle={t('flow.toggles.controlHidden')}
        icon={SlidersHorizontal}
        onChange={(shown) => {
          refresh();
          setControl(shown);
        }}
      />
      <ShowToggle
        shown={unlinked}
        label={t('flow.toggles.unlinkedLabel')}
        shownTitle={t('flow.toggles.unlinkedShown')}
        hiddenTitle={t('flow.toggles.unlinkedHidden')}
        icon={StickyNote}
        onChange={(shown) => {
          refresh();
          setUnlinked(shown);
        }}
      />
    </div>
  );
}
