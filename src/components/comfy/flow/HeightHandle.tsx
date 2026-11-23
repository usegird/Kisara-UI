import { useContext } from 'react';

import { ColumnZoomContext } from '@/components/comfy/flow/column-zoom-context';
import {
  HeightHandle as EdgeHeightHandle,
  type HeightHandleProps as EdgeHeightHandleProps,
} from '@/components/ui/height-handle';
import { DEFAULT_MULTILINE_HEIGHT, MIN_MULTILINE_HEIGHT } from '@/graph/multiline-height';
import type { NodeRow } from '@/graph/rows';

export interface HeightHandleProps extends Omit<EdgeHeightHandleProps, 'min' | 'zoom'> {
  readonly min?: number | undefined;
}

export function HeightHandle({
  min = MIN_MULTILINE_HEIGHT,
  ...props
}: HeightHandleProps): React.ReactElement {
  const zoom = useContext(ColumnZoomContext);
  return <EdgeHeightHandle {...props} min={min} zoom={zoom} />;
}

export interface TextHeightHandleProps {
  readonly label: string;
  readonly rows: readonly NodeRow[];
  readonly onResizeText: (row: NodeRow, height: number) => void;
}

export function TextHeightHandle({
  label,
  rows,
  onResizeText,
}: TextHeightHandleProps): React.ReactElement | null {
  const first = rows[0];
  if (!first) return null;

  const parts = rows.length;
  const each = first.height ?? DEFAULT_MULTILINE_HEIGHT;

  return (
    <HeightHandle
      label={label}
      height={each * parts}
      min={MIN_MULTILINE_HEIGHT * parts}
      onChange={(total) => onResizeText(first, total / parts)}
      menuAction
    />
  );
}
