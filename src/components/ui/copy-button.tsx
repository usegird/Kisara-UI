import { cva } from 'class-variance-authority';
import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { t, type MessageKey } from '@/i18n';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

const COPY_TEXT = {
  idle: 'ui.copy.copy',
  copied: 'ui.copy.copied',
  failed: 'ui.copy.failed',
} as const satisfies Record<string, MessageKey>;

const copyButton = cva('hover:bg-muted flex shrink-0 items-center gap-1 rounded-md', {
  variants: {
    iconOnly: { true: 'p-1', false: 'px-1.5 py-0.5' },
    frameless: {
      true: 'text-muted-foreground hover:text-foreground',
      false: 'border-input border',
    },
  },
});

const FEEDBACK_MS = 1500;

export interface CopyButtonProps {
  readonly text: string;
  readonly label: string;
  readonly iconOnly?: boolean | undefined;
  readonly frameless?: boolean | undefined;
  readonly className?: string | undefined;
}

export function CopyButton({
  text,
  label,
  iconOnly = false,
  frameless = false,
  className,
}: CopyButtonProps): React.ReactElement {
  const [feedback, setFeedback] = useState<{ readonly ok: boolean } | null>(null);
  const state = copyStateOf(feedback);

  useEffect(() => {
    if (feedback === null) return;
    const timer = globalThis.setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => globalThis.clearTimeout(timer);
  }, [feedback]);

  const copy = async (): Promise<void> => {
    setFeedback({ ok: await copyText(text) });
  };

  return (
    <button
      type="button"
      className={cn(copyButton({ iconOnly, frameless }), className)}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        void copy();
      }}
    >
      {state === 'copied' ? (
        <Check className="size-3" aria-hidden />
      ) : (
        <Copy className="size-3" aria-hidden />
      )}
      {iconOnly ? null : t(COPY_TEXT[state])}
    </button>
  );
}

function copyStateOf(feedback: { readonly ok: boolean } | null): keyof typeof COPY_TEXT {
  if (feedback === null) return 'idle';
  return feedback.ok ? 'copied' : 'failed';
}
