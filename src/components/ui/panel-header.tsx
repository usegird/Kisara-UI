import { DialogCloseButton, DialogHeader } from '@/components/ui/dialog-header';
import { t } from '@/i18n';

export interface PanelHeaderProps {
  readonly title?: React.ReactNode | undefined;
  readonly subtitle?: React.ReactNode | undefined;
  readonly actions?: React.ReactNode | undefined;
  readonly onClose: () => void;
  readonly closeLabel?: string | undefined;
  readonly closeTitle?: string | undefined;
}

export function PanelHeader({
  title,
  subtitle,
  actions,
  onClose,
  closeLabel = t('common.close'),
  closeTitle = closeLabel,
}: PanelHeaderProps): React.ReactElement {
  return (
    <DialogHeader
      heading={
        title === undefined ? undefined : (
          <h2 className="shrink-0 text-sm font-semibold">{title}</h2>
        )
      }
      subtitle={subtitle}
      actions={actions}
      close={<DialogCloseButton onClose={onClose} label={closeLabel} title={closeTitle} />}
    />
  );
}
