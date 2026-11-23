import {
  appCardAnchorKey,
  appSourceAnchorKey,
  appTargetAnchorKey,
  cardAnchorKey,
} from '@/components/comfy/flow/anchor-context';
import type { ClipArea, ViewAreas } from '@/components/comfy/flow/connector-areas';
import type { Connector } from '@/components/comfy/flow/connector-geometry';
import type { AppInputGroup } from '@/graph/app-input-order';
import { proxyRowKey, type DisplayGraph } from '@/graph/subgraph-display';
import { leftAnchor, type Rects } from '@/hooks/ui/use-anchor-registry';
import { t } from '@/i18n';

export const APP_LINE_TYPE = '__app';

export function appConnectors(
  areas: ViewAreas,
  rects: Rects,
  group: AppInputGroup,
  proxyRows: DisplayGraph['proxyRows'],
): Connector[] {
  const card = rects.get(appCardAnchorKey(group.key));
  if (!card) return [];

  const result: Connector[] = [];
  for (const row of group.rows) {
    const field = rects.get(appSourceAnchorKey(group.nodeId, row.widgetName));
    const inner = proxyRows.get(proxyRowKey(group.nodeId, row.widgetName));
    const target =
      rects.get(appTargetAnchorKey(group.nodeId, row.widgetName)) ??
      (inner ? rects.get(appTargetAnchorKey(inner.nodeId, inner.widgetName)) : undefined) ??
      rects.get(cardAnchorKey(group.nodeId));
    if (!field || !target) continue;

    const from = { x: card.right, y: field.centerY };
    const to = leftAnchor(target);
    const fromShown = inBand(from.y, areas.appBand);
    const toShown = inBand(to.y, areas.band);
    if (!fromShown && !toShown) continue;

    result.push({
      id: `a:${String(group.nodeId)}.${row.widgetName}`,
      kind: 'app',
      from,
      to,
      type: APP_LINE_TYPE,
      label: t('flow.connector.appLine', { name: row.widgetName }),
      align: { column: 'app', other: from.y, card: to.y },
      clip: appLineClip(areas, fromShown, toShown),
    });
  }
  return result;
}

function appLineClip(areas: ViewAreas, fromShown: boolean, toShown: boolean): ClipArea | undefined {
  if (fromShown && toShown) return undefined;
  return fromShown ? appClip(areas) : areas.band;
}

function appClip(areas: ViewAreas): ClipArea | undefined {
  const { appBand, band } = areas;
  if (!appBand || !band) return appBand ?? band;
  return { top: Math.min(appBand.top, band.top), bottom: Math.max(appBand.bottom, band.bottom) };
}

function inBand(y: number, area: ClipArea | undefined): boolean {
  return area === undefined || (y >= area.top && y <= area.bottom);
}
