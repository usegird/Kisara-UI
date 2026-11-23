import { TextCursor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { caretRectOf } from '@/lib/caret-rect';
import { INSERT_CARET_MARK } from '@/lib/text-drag-session';

const MIN_SIZE = 14;

const EDGE_SLACK = 1;

const FIELD_EVENTS = ['input', 'selectionchange', 'keyup', 'pointerup'] as const;

interface MarkerSpot {
  readonly left: number;
  readonly top: number;
  readonly height: number;
}

export function InsertCaretMarker({
  field,
}: {
  readonly field: HTMLTextAreaElement;
}): React.ReactElement | null {
  const [spot, setSpot] = useState<MarkerSpot | null>(null);

  useEffect(() => {
    const doc = field.ownerDocument;
    const view = doc.defaultView;
    const update = (): void => {
      const next = spotOf(field);
      setSpot((current) =>
        current?.left === next?.left &&
        current?.top === next?.top &&
        current?.height === next?.height
          ? current
          : next,
      );
    };
    update();
    doc.addEventListener('selectionchange', update);
    doc.addEventListener('scroll', update, true);
    for (const type of FIELD_EVENTS) field.addEventListener(type, update);
    view?.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(field);
    return () => {
      doc.removeEventListener('selectionchange', update);
      doc.removeEventListener('scroll', update, true);
      for (const type of FIELD_EVENTS) field.removeEventListener(type, update);
      view?.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [field]);

  if (spot === null) return null;
  return createPortal(
    <span
      aria-hidden
      {...{ [INSERT_CARET_MARK]: '' }}
      className="text-success pointer-events-none fixed z-40"
      style={{ left: spot.left - spot.height / 2, top: spot.top }}
    >
      <TextCursor style={{ width: spot.height, height: spot.height }} strokeWidth={2.5} />
    </span>,
    field.ownerDocument.body,
  );
}

export function InsertTargetSubtitle({
  subtitle,
  blocked,
}: {
  readonly subtitle: string;
  readonly blocked: string | null;
}): React.ReactNode {
  if (blocked === null) return subtitle;
  return <span className="text-destructive">{blocked}</span>;
}

function spotOf(field: HTMLTextAreaElement): MarkerSpot | null {
  if (!field.isConnected) return null;
  const caret = caretRectOf(field, field.selectionStart);
  const box = field.getBoundingClientRect();
  const inside =
    caret.top >= box.top - EDGE_SLACK &&
    caret.bottom <= box.bottom + EDGE_SLACK &&
    caret.left >= box.left - EDGE_SLACK &&
    caret.left <= box.right + EDGE_SLACK;
  if (!inside) return null;
  return { left: caret.left, top: caret.top, height: Math.max(caret.bottom - caret.top, MIN_SIZE) };
}
