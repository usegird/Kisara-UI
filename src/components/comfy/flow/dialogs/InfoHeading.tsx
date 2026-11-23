import type { LucideIcon } from 'lucide-react';

export const INFO_SECTION_CLASS = 'pt-1';

export interface InfoHeadingProps {
  readonly id?: string | undefined;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly children?: React.ReactNode;
}

export function InfoHeading({
  id,
  icon: Icon,
  label,
  children,
}: InfoHeadingProps): React.ReactElement {
  return (
    <div className="mb-1 flex min-h-5 items-center gap-1">
      <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      <h4 id={id} className="text-muted-foreground font-semibold">
        {label}
      </h4>
      {children}
    </div>
  );
}
