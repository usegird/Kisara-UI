import type { CardActions } from '@/components/comfy/flow/NodeCard';
import { OutputChip } from '@/components/comfy/flow/OutputChip';
import type { NodeView } from '@/graph/rows';

export function OutputChips({
  view,
  onAddAfter,
}: { readonly view: NodeView } & Pick<CardActions, 'onAddAfter'>): React.ReactElement {
  return (
    <>
      {view.outputs.map((output, slot) => (
        <OutputChip
          key={`${output.name}:${slot}`}
          nodeId={view.id}
          slot={slot}
          output={output}
          onAddAfter={onAddAfter}
        />
      ))}
    </>
  );
}
