import { groupTone } from '@/components/comfy/flow/group-frame-look';
import type { FrameRect } from '@/components/comfy/flow/VariablePanel';
import type { GroupLabel } from '@/graph/groups';
import { VARIABLE_PANEL_METRICS } from '@/graph/variable-panel-metrics';
import { t } from '@/i18n';

const { LEFT_GUTTER, FRAME_SIDE_PADDING, FRAME_TAB_HEIGHT } = VARIABLE_PANEL_METRICS;

export function GroupFrame({
  label,
  rect,
  onReveal,
}: {
  readonly label: GroupLabel;
  readonly rect: FrameRect;
  readonly onReveal: ((key: string) => void) | undefined;
}): React.ReactElement {
  const tone = groupTone(label.color);
  const title = t('flow.variables.cardGroupReveal', { title: label.title });
  return (
    <div
      data-flow-item
      className="absolute"
      style={{
        left: LEFT_GUTTER - FRAME_SIDE_PADDING,
        right: 0,
        top: rect.top,
        height: rect.height,
      }}
    >
      <div
        className="absolute top-0 left-0 flex max-w-[70%] items-center rounded-t-md"
        style={{ ...tone.tab, height: FRAME_TAB_HEIGHT }}
      >
        <span
          className="min-w-0 cursor-default truncate px-1.5 text-3xs font-semibold select-none"
          title={onReveal ? title : label.title}
          onDoubleClick={onReveal ? () => onReveal(label.key) : undefined}
        >
          {label.title}
        </span>
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 rounded-md rounded-tl-none"
        style={{ ...tone.frame, top: FRAME_TAB_HEIGHT }}
      />
    </div>
  );
}
