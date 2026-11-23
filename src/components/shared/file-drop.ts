import { cva } from 'class-variance-authority';

export const dropOverlay = cva(
  `border-primary bg-primary/5 text-primary pointer-events-none absolute inset-2 z-10 flex
    items-center justify-center rounded-md border-2 border-dashed text-sm`,
);

export function carriesFiles(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes('Files');
}
