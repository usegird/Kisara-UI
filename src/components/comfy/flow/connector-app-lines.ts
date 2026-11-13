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

// ─────────────────────────────
// アプリ入力の枠からカードの行への線の幾何。位置の表から、両端と見切る高さを決める
// ─────────────────────────────

/** アプリ入力の線の型の印。線はスロット型に関係なく灰色にする（飾りなので目立たせない） */
export const APP_LINE_TYPE = '__app';

/**
 * アプリ入力の枠 → カードの行。片方の端が列の外へスクロールしていても、
 * **あるはずの位置へ向けて引き、見えている列の高さで見切る**（変数の線と同じ扱い）。
 * 両端とも見えていなければ引かない（左の列とカードの列は別々にスクロールする）
 */
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
    // 開いた subgraph の昇格した入力は、中の行が終点（インスタンスのカードは枠になっている）
    const inner = proxyRows.get(proxyRowKey(group.nodeId, row.widgetName));
    const target =
      rects.get(appTargetAnchorKey(group.nodeId, row.widgetName)) ??
      (inner ? rects.get(appTargetAnchorKey(inner.nodeId, inner.widgetName)) : undefined) ??
      rects.get(cardAnchorKey(group.nodeId));
    if (!field || !target) continue;

    // 横は枠の右の枠線、高さはその項目の入力欄の中ほど
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
      // 見えていない端の側を、見えている方の列の高さで切る。アプリ入力の側は、列より下にも
      // カードの列が見えていれば、そこまで伸ばす（狭い画面では列の底が中身の高さで止まる）
      clip: appLineClip(areas, fromShown, toShown),
    });
  }
  return result;
}

/** アプリ入力の線を見切る高さ。両端とも見えていれば切らない */
function appLineClip(areas: ViewAreas, fromShown: boolean, toShown: boolean): ClipArea | undefined {
  if (fromShown && toShown) return undefined;
  return fromShown ? appClip(areas) : areas.band;
}

/** アプリ入力の側で線を見切る高さ。アプリ入力の列とカードの列の見えている範囲を合わせたもの */
function appClip(areas: ViewAreas): ClipArea | undefined {
  const { appBand, band } = areas;
  if (!appBand || !band) return appBand ?? band;
  return { top: Math.min(appBand.top, band.top), bottom: Math.max(appBand.bottom, band.bottom) };
}

function inBand(y: number, area: ClipArea | undefined): boolean {
  return area === undefined || (y >= area.top && y <= area.bottom);
}
