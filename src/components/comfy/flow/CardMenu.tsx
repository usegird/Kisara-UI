import type { CardActions } from '@/components/comfy/flow/NodeCard';
import { NodeStyleMenu } from '@/components/comfy/flow/NodeStyleMenu';
import {
  ContextMenuActionSections,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import type { NodeView } from '@/graph/rows';
import type { KeyboardMenu } from '@/hooks/ui/use-keyboard-menu';
import { t } from '@/i18n';

// ─────────────────────────────
// カードの右クリックメニュー
// ─────────────────────────────

/**
 * カードの右クリックメニュー
 */
export function CardMenu({
  view,
  keyboardMenu,
  onSelect,
  onOpenSettings,
  onSettingsChange,
  onPickColor,
  onClone,
  onGroup,
  onDelete,
  onOpenSubgraph,
  subgraphOpen,
  onCloseSubgraph,
  onConvertSubgraph,
}: {
  readonly view: NodeView;
  readonly keyboardMenu: KeyboardMenu;
  readonly onPickColor: React.ComponentProps<typeof NodeStyleMenu>['onPickColor'];
} & Pick<
  CardActions,
  | 'onSelect'
  | 'onOpenSettings'
  | 'onSettingsChange'
  | 'onClone'
  | 'onGroup'
  | 'onDelete'
  | 'onOpenSubgraph'
  | 'subgraphOpen'
  | 'onCloseSubgraph'
  | 'onConvertSubgraph'
>): React.ReactElement {
  return (
    <ContextMenuContent
      label={t('flow.card.menu', { name: view.displayName })}
      finalFocus={keyboardMenu.finalFocus}
    >
      {/* キーボードから開いたときだけ、Tab から外した行とカードの操作を上に並べる。
          カードのまとまりの末尾に、選択に足す・外す（Ctrl+Enter と同じ）を置く */}
      {keyboardMenu.sections === null ? null : (
        <ContextMenuActionSections
          sections={keyboardMenu.sections}
          onChoose={keyboardMenu.choose}
          extra={(_, index) =>
            onSelect && index === (keyboardMenu.sections?.length ?? 0) - 1 ? (
              <ContextMenuItem onClick={() => onSelect(view.id, true)}>
                {t('flow.card.toggleSelect', { name: view.displayName })}
              </ContextMenuItem>
            ) : null
          }
        />
      )}
      {view.kind === 'subgraph' && onConvertSubgraph ? (
        <ContextMenuItem
          title={t('flow.subgraph.toGroupTitle')}
          onClick={() => onConvertSubgraph(view.id)}
        >
          {t('flow.subgraph.toGroup')}
        </ContextMenuItem>
      ) : null}
      {renderSubgraphToggle(view, { subgraphOpen, onCloseSubgraph, onOpenSubgraph })}
      <ContextMenuItem
        disabled={!onOpenSettings}
        title={t('flow.card.settingsTitle')}
        onClick={() => onOpenSettings?.(view.id)}
      >
        {t('flow.card.settings')}
      </ContextMenuItem>
      {onSettingsChange ? (
        <NodeStyleMenu
          nodeId={view.id}
          onSettingsChange={onSettingsChange}
          onPickColor={onPickColor}
        />
      ) : null}
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={!onClone}
        title={onGroup ? t('flow.card.cloneSelectedTitle') : t('flow.card.cloneTitle')}
        onClick={() => onClone?.(view.id)}
      >
        {t('flow.card.clone')}
      </ContextMenuItem>
      {/* 選んでいるカードのときだけ出す */}
      {onGroup ? (
        <ContextMenuItem title={t('flow.card.groupTitle')} onClick={() => onGroup(view.id)}>
          {t('flow.card.group')}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem disabled={!onDelete} onClick={() => onDelete?.(view.id)}>
        {t('flow.shared.deleteNode')}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

/** メニューの subgraph を開く・閉じる。開いていれば閉じる方だけを出す */
function renderSubgraphToggle(
  view: NodeView,
  {
    subgraphOpen,
    onCloseSubgraph,
    onOpenSubgraph,
  }: Pick<CardActions, 'subgraphOpen' | 'onCloseSubgraph' | 'onOpenSubgraph'>,
): React.ReactElement | null {
  if (view.kind !== 'subgraph') return null;
  if (subgraphOpen === true && onCloseSubgraph) {
    return (
      <>
        <ContextMenuItem
          title={t('flow.subgraph.closeTitle')}
          onClick={() => onCloseSubgraph(view.id)}
        >
          {t('flow.subgraph.closeMenu')}
        </ContextMenuItem>
        <ContextMenuSeparator />
      </>
    );
  }
  if (!onOpenSubgraph) return null;
  return (
    <>
      <ContextMenuItem title={t('flow.subgraph.openTitle')} onClick={() => onOpenSubgraph(view.id)}>
        {t('flow.subgraph.openMenu')}
      </ContextMenuItem>
      <ContextMenuSeparator />
    </>
  );
}
