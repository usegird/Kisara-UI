import { DialogFrame } from '@/components/ui/dialog';
import { useNarrowScreen } from '@/hooks/ui/use-narrow-screen';

export const AGREEMENT_LINK = 'text-foreground underline underline-offset-2 hover:opacity-80';

export const DOCUMENT_TEXT_CLASS =
  'text-muted-foreground flex flex-col gap-2 text-xs leading-relaxed';

const DOCUMENT_MIN = { width: 360, height: 320 };

const URL_PATTERN = /(https:\/\/[^\s()（）]+)/;

export interface DocumentDialogProps {
  readonly id: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly wide?: boolean | undefined;
  readonly children: React.ReactNode;
}

export function DocumentDialog({
  id,
  open,
  onOpenChange,
  title,
  wide = false,
  children,
}: DocumentDialogProps): React.ReactElement {
  const narrow = useNarrowScreen();
  return (
    <DialogFrame
      id={id}
      open={open}
      onOpenChange={onOpenChange}
      size={wide ? 'documentWide' : 'document'}
      embeddable={false}
      movable={!narrow}
      minSize={DOCUMENT_MIN}
      fullOnNarrow
      title={title}
    >
      <div
        tabIndex={0}
        role="region"
        aria-label={title}
        className="min-h-0 flex-1 overflow-y-auto p-4"
      >
        {children}
      </div>
    </DialogFrame>
  );
}

export interface DocumentBodyProps {
  readonly text: string;
  readonly footer?: string | undefined;
}

export function DocumentBody({ text, footer }: DocumentBodyProps): React.ReactElement {
  const paragraphs = text.split('\n\n');
  return (
    <div className={DOCUMENT_TEXT_CLASS}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-wrap">
          <LinkedText text={paragraph} />
        </p>
      ))}
      {footer === undefined ? null : <p className="mt-2">{footer}</p>}
    </div>
  );
}

function LinkedText({ text }: { readonly text: string }): React.ReactElement {
  return (
    <>
      {text.split(URL_PATTERN).map((part, index) =>
        index % 2 === 0 ? (
          part
        ) : (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={AGREEMENT_LINK}
          >
            {part}
          </a>
        ),
      )}
    </>
  );
}
