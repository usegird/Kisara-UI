import { cva } from 'class-variance-authority';
import { SlidersHorizontal, StickyNote } from 'lucide-react';

import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

const toggle = cva('hover:bg-muted rounded p-1 transition-opacity', {
  variants: {
    shown: {
      true: 'text-foreground opacity-90',
      false: 'text-muted-foreground',
    },
  },
});

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
  readonly shownTitle: string;
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

export function HiddenNodeToggles(): React.ReactElement {
  const control = useSettingsStore((state) => state.showControlNodes);
  const setControl = useSettingsStore((state) => state.setShowControlNodes);
  const unlinked = useSettingsStore((state) => state.showUnlinkedNodes);
  const setUnlinked = useSettingsStore((state) => state.setShowUnlinkedNodes);
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
