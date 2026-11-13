import { useShallow } from 'zustand/react/shallow';

import {
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSubmenu,
} from '@/components/ui/context-menu';
import {
  NODE_COLOR_OPTIONS,
  nodeColorChoice,
  readNodeSettings,
  type NodeSettingsPatch,
} from '@/graph/node-settings';
import { NODE_MODE } from '@/graph/types';
import { t, type MessageKey } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// カードの右クリックメニューの実行モード・色。カスタムの色選びは use-color-picker。
// ─────────────────────────────

const MODE_CHOICES = [
  { value: NODE_MODE.normal, label: 'flow.style.modeNormal' },
  { value: NODE_MODE.bypass, label: 'flow.style.modeBypass' },
  { value: NODE_MODE.mute, label: 'flow.style.modeMute' },
] as const satisfies readonly { value: number; label: MessageKey }[];

/** 既定（色なし）を表す選択肢の値。選ぶと両方のキーを落とす（`writeNodeSettings` は null で消す） */
const NO_COLOR = '';

/** 実行モード・色のメニューの受け取り物 */
export interface NodeStyleMenuProps {
  readonly nodeId: number;
  readonly onSettingsChange: (id: number, patch: NodeSettingsPatch) => void;
  /** 「カスタム…」。今の本体の色を渡す */
  readonly onPickColor: (current: string | null) => void;
}

/**
 * 右クリックメニューに実行モードと色の選択肢を出す。
 * メニューを開いている間だけストアを読む（カードの描画ごとには読まない）
 */
export function NodeStyleMenu({
  nodeId,
  onSettingsChange,
  onPickColor,
}: NodeStyleMenuProps): React.ReactElement {
  const settings = useGraphStore(
    useShallow((state) => {
      const node = state.workflow?.nodes.find((candidate) => candidate.id === nodeId);
      const read = node ? readNodeSettings(node) : null;
      return {
        mode: read?.mode ?? NODE_MODE.normal,
        color: read?.color ?? null,
        bgcolor: read?.bgcolor ?? null,
      };
    }),
  );
  const choice = nodeColorChoice(settings.color, settings.bgcolor);

  return (
    <>
      <ContextMenuSubmenu label={t('flow.style.mode')}>
        <ContextMenuRadioGroup
          value={settings.mode}
          onValueChange={(mode: number) => onSettingsChange(nodeId, { mode })}
        >
          {MODE_CHOICES.map((choice) => (
            <ContextMenuRadioItem key={choice.value} value={choice.value}>
              {t(choice.label)}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      </ContextMenuSubmenu>
      {/* 本体と同じく、見出しの帯と本体を組で塗る。見本は本体の色 */}
      <ContextMenuSubmenu label={t('flow.style.color')}>
        <ContextMenuRadioGroup
          value={choice ?? NO_COLOR}
          onValueChange={(key: string) => {
            const option = NODE_COLOR_OPTIONS.find((candidate) => candidate.key === key);
            onSettingsChange(
              nodeId,
              option
                ? { color: option.color, bgcolor: option.bgcolor }
                : { color: null, bgcolor: null },
            );
          }}
        >
          <ContextMenuRadioItem value={NO_COLOR}>
            {t('flow.style.defaultColor')}
          </ContextMenuRadioItem>
          {NODE_COLOR_OPTIONS.map((option) => (
            <ContextMenuRadioItem key={option.key} value={option.key} swatch={option.bgcolor}>
              {option.label}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onPickColor(settings.bgcolor)}>
          <span className="flex items-center gap-2 pl-[22px]">
            {/* 組に無い色のときだけ、今の色の見本を付ける */}
            {choice === 'custom' && settings.bgcolor !== null ? (
              <span
                aria-hidden
                className="border-border size-3.5 shrink-0 rounded-sm border"
                style={{ backgroundColor: settings.bgcolor }}
              />
            ) : null}
            {t('flow.style.custom')}
          </span>
        </ContextMenuItem>
      </ContextMenuSubmenu>
    </>
  );
}
