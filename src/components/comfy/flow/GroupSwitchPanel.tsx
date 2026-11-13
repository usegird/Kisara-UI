import { Switch } from '@base-ui/react/switch';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';

import { groupTone } from '@/components/comfy/flow/group-frame-look';
import { ContextMenuItem } from '@/components/ui/context-menu';
import { groupSwitchesOf, groupSwitchShownOf, type GroupSwitchView } from '@/graph/group-switch';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// アプリ入力の列の先頭に置く、グループの切り替えの枠。スイッチは基盤（Base UI）に任せる。
// ─────────────────────────────

/** スイッチのつまみ。「一部」は中ほどに置く */
const thumb = cva('bg-background relative size-3 rounded-full shadow-sm transition-transform', {
  variants: {
    state: { on: 'translate-x-3.5', off: 'translate-x-0.5', mixed: 'translate-x-2' },
  },
});

/** スイッチの地。入りは強調の色、「一部」は切りより少し濃い */
const track = cva('absolute inset-x-0 top-1 h-4 rounded-full transition-colors', {
  variants: {
    state: { on: 'bg-switch-on', off: 'bg-muted-foreground/70', mixed: 'bg-switch-on/50' },
  },
});

/** グループの切り替えを並べる。出しているものが無ければ何も描かない */
export function GroupSwitchPanel(): React.ReactElement | null {
  // 切り替えの状態はノードの `mode` から読むので、ワークフローを受ける（列の入力の値は別のストア）
  const workflow = useGraphStore((state) => state.workflow);
  const setNodesBypassed = useGraphStore((state) => state.setNodesBypassed);
  const clearSwitches = useGraphStore((state) => state.clearGroupSwitches);
  const switches = workflow ? groupSwitchesOf(workflow) : [];
  if (switches.length === 0) return null;

  return (
    <section className="bg-band/60 mb-3 rounded-md pt-[5px] pr-2 pb-2 pl-1.5">
      <p className="text-foreground/70 mb-1.5 flex items-center gap-1 pl-0.5 text-2xs">
        <span className="font-semibold">{t('flow.groupSwitch.title')}</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-muted ml-auto shrink-0
            rounded p-0.5"
          aria-label={t('flow.groupSwitch.clearLabel')}
          title={t('flow.groupSwitch.clearTitle')}
          onClick={clearSwitches}
        >
          <X className="size-3" aria-hidden />
        </button>
      </p>
      <ul className="flex flex-col gap-1.5">
        {switches.map((entry) => (
          <GroupSwitchRow
            key={entry.groupId}
            entry={entry}
            // 「一部」から押したら入れる
            onChange={(checked) => setNodesBypassed(entry.nodeIds, !checked)}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * グループのタブの右クリックの「アプリ入力に切り替えを出す・外す」。`id` の無いグループには出さない
 */
export function GroupSwitchMenuItem({
  groupKey,
}: {
  /** グループの鍵（`groupKeyAt`） */
  readonly groupKey: string;
}): React.ReactElement | null {
  const toggleSwitch = useGraphStore((state) => state.toggleGroupSwitch);
  // 真偽だけを受け、ワークフローの変更ごとには描き直さない
  const shown = useGraphStore((state) =>
    state.workflow ? groupSwitchShownOf(state.workflow, groupKey) : null,
  );
  if (shown === null) return null;

  return (
    <ContextMenuItem title={t('flow.cardGroup.switchTitle')} onClick={() => toggleSwitch(groupKey)}>
      {shown ? t('flow.cardGroup.switchHide') : t('flow.cardGroup.switchShow')}
    </ContextMenuItem>
  );
}

function GroupSwitchRow({
  entry,
  onChange,
}: {
  readonly entry: GroupSwitchView;
  readonly onChange: (checked: boolean) => void;
}): React.ReactElement {
  const mixed = entry.state === 'mixed';
  return (
    <li>
      <label className="text-foreground flex items-center gap-2 text-xs">
        <span
          aria-hidden
          className="h-3 w-1 shrink-0 rounded-sm"
          style={groupTone(entry.color).tab}
        />
        <span className="min-w-0 flex-1 truncate">{entry.title}</span>
        {mixed ? (
          <span className="text-muted-foreground text-2xs">{t('flow.groupSwitch.mixed')}</span>
        ) : null}
        {/* 押せる高さは 24px、場所を取るのは見えている 16px（負の余白。WCAG 2.5.8） */}
        <Switch.Root
          checked={entry.state === 'on'}
          onCheckedChange={() => onChange(entry.state !== 'on')}
          className="relative -my-1 inline-flex h-6 w-7 shrink-0 items-center rounded-full
            focus-visible:outline-2"
        >
          <span aria-hidden className={track({ state: entry.state })} />
          <Switch.Thumb className={thumb({ state: entry.state })} />
        </Switch.Root>
      </label>
    </li>
  );
}
