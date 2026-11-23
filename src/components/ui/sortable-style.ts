import { CSS, type Transform } from '@dnd-kit/utilities';

export const DRAGGING_Z_INDEX = 10;

export function sortableStyle(
  transform: Transform | null,
  transition: string | undefined,
): React.CSSProperties {
  return { transform: CSS.Translate.toString(transform), transition };
}
