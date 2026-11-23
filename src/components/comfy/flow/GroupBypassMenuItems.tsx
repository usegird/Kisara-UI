import { ContextMenuItem } from '@/components/ui/context-menu';
import { bypassStateOf } from '@/graph/node-bypass';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';

export function GroupBypassMenuItems({
  memberIds,
}: {
  readonly memberIds: readonly NodeId[];
}): React.ReactElement | null {
  const setBypassed = useGraphStore((state) => state.setNodesBypassed);
  const state = useGraphStore((store) =>
    store.workflow ? bypassStateOf(store.workflow, memberIds) : null,
  );
  if (state === null) return null;

  return (
    <>
      {state === 'bypassed' ? null : (
        <ContextMenuItem
          title={t('flow.cardGroup.bypassTitle')}
          onClick={() => setBypassed(memberIds, true)}
        >
          {t('flow.cardGroup.bypass')}
        </ContextMenuItem>
      )}
      {state === 'normal' ? null : (
        <ContextMenuItem
          title={t('flow.cardGroup.enableTitle')}
          onClick={() => setBypassed(memberIds, false)}
        >
          {t('flow.cardGroup.enable')}
        </ContextMenuItem>
      )}
    </>
  );
}
