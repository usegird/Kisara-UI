import { useCallback } from 'react';

export interface DragGhostProps {
  readonly node: HTMLElement;
  readonly zoom: number;
}

export function DragGhost({ node, zoom }: DragGhostProps): React.ReactElement {
  const attachGhost = useCallback(
    (element: HTMLDivElement | null) => {
      element?.replaceChildren(node);
    },
    [node],
  );

  return (
    <div
      ref={attachGhost}
      aria-hidden
      className="pointer-events-none list-none opacity-90 drop-shadow-lg"
      style={{ zoom }}
    />
  );
}
