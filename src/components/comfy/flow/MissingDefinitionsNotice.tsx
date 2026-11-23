import { t } from '@/i18n';

export interface MissingDefinitionsNoticeProps {
  readonly empty: boolean;
}

export function MissingDefinitionsNotice({
  empty,
}: MissingDefinitionsNoticeProps): React.ReactElement | null {
  if (!empty) return null;

  return (
    <p className="text-muted-foreground mx-auto mb-4 max-w-7xl text-xs">
      {t('flow.missingDefinitions')}
    </p>
  );
}
