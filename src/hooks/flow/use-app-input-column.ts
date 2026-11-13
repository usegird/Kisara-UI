import { useLayoutEffect, useRef } from 'react';

import { appInputGroups, appInputOrder, type AppInputGroup } from '@/graph/app-input-order';
import {
  appInputHeights,
  appInputSpanKey,
  appInputSpans,
  toggleAppInput as toggleAppInputIn,
} from '@/graph/app-inputs';
import type { NodeView } from '@/graph/rows';
import type { NodeId, Workflow } from '@/graph/types';
import { useItemMotion, type ItemMotion } from '@/hooks/flow/use-flow-motion';
import { useStableContent } from '@/hooks/ui/use-stable-content';
import { sameEntries } from '@/lib/reuse-equal';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// アプリ入力の列へ渡すものと、カード側の印からの切り替え。FlowCanvas から切り出した状態と手続き。
// ─────────────────────────────

/** アプリ入力の列へ渡す枠・項目の大きさ・動きと、切り替えの手続き */
export interface AppInputColumn {
  /** 枠（カードごと）。並び順は `extra.linearData.inputs` の配列順 */
  readonly groups: readonly AppInputGroup[];
  /** 項目の幅（12 分割）。載っていないものは全幅 */
  readonly spans: ReturnType<typeof appInputSpans>;
  /** 項目の高さ（px）。載っていないものは既定の高さ。カードの高さとは別 */
  readonly heights: ReturnType<typeof appInputHeights>;
  /** 枠の滑り込みと抜け出し */
  readonly groupMotion: ItemMotion<string>;
  /** 枠の中の項目の滑り込みと抜け出し */
  readonly fieldMotion: ItemMotion<string>;
  /**
   * カード側の印でアプリ入力を切り替える。枠ごとか項目だけかを選んで動かしてから外す。
   */
  readonly toggle: (nodeId: NodeId, widgetName: string) => void;
  /** 枠の ×。枠が右へ抜けてから、その枠の項目を外す */
  readonly removeGroup: (group: AppInputGroup) => void;
}

/**
 * アプリ入力の列へ渡す枠と、カード側からの切り替えの手続きを作る。
 * @param remeasure - 枠や項目が動いている間、線を付いて動かすための測り直し
 */
export function useAppInputColumn(
  workflow: Workflow | null,
  views: readonly NodeView[],
  remeasure: () => void,
): AppInputColumn {
  const toggleAppInput = useGraphStore((state) => state.toggleAppInput);
  const removeAppInputs = useGraphStore((state) => state.removeAppInputs);

  // 枠と、枠の中の項目はカードと同じ動き
  const groupMotion = useItemMotion<string>(remeasure);
  const fieldMotion = useItemMotion<string>(remeasure);

  const order = workflow ? appInputOrder(workflow) : [];
  // 列と線へ渡すものは、中身が同じなら前回のものを渡す（値の編集で描き直さないため）
  const groups = useStableContent(appInputGroups(views, order));
  const spans = useStableContent(
    workflow ? appInputSpans(workflow) : new Map<string, number>(),
    sameEntries,
  );
  const heights = useStableContent(
    workflow ? appInputHeights(workflow) : new Map<string, number>(),
    sameEntries,
  );

  // どちらの枠になるかは、切り替えたあとの並びを先に組んで確かめる（純関数）。
  // 並びは呼ばれた時点のものを読む。手続き自体は作り直さない（全カードに渡すため）
  const latest = useRef({ workflow, views, groups });
  useLayoutEffect(() => {
    latest.current = { workflow, views, groups };
  });
  const { enter: enterGroup, leave: leaveGroup } = groupMotion;
  const { enter: enterField, leave: leaveField } = fieldMotion;
  const toggle = (nodeId: NodeId, widgetName: string): void => {
    const { workflow, views, groups } = latest.current;
    // 項目の鍵は幅の指定と同じ「ノード:項目」の形
    const fieldKey = appInputSpanKey(nodeId, widgetName);
    const holds = (group: AppInputGroup): boolean =>
      group.nodeId === nodeId && group.rows.some((row) => row.widgetName === widgetName);
    const group = groups.find(holds);

    if (group !== undefined) {
      const remove = (): void => toggleAppInput(nodeId, widgetName);
      if (group.rows.length === 1) leaveGroup(group.key, remove);
      else leaveField(fieldKey, remove);
      return;
    }

    const next = workflow ? appInputOrder(toggleAppInputIn(workflow, nodeId, widgetName)) : [];
    const joined = appInputGroups(views, next).find(holds);
    toggleAppInput(nodeId, widgetName);
    if (joined === undefined) return;
    if (joined.rows.length === 1) enterGroup(joined.key);
    else enterField(fieldKey);
  };

  const removeGroup = (group: AppInputGroup): void =>
    leaveGroup(group.key, () =>
      removeAppInputs(
        group.rows.map((row) => ({ nodeId: group.nodeId, widgetName: row.widgetName })),
      ),
    );

  return { groups, spans, heights, groupMotion, fieldMotion, toggle, removeGroup };
}
