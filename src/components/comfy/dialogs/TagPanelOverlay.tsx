import { INSERT_SOURCE_MARK } from '@/components/comfy/dialogs/insert-target';
import { DialogWindow } from '@/components/ui/dialog-window';
import { lazyPart } from '@/components/ui/lazy-part';
import { PartLoading } from '@/components/ui/part-loading';
import { t } from '@/i18n';
import { TAG_PANEL_DIALOG, useTagsStore } from '@/store/use-tags-store';

const TagPanel = lazyPart<Record<never, never>>(
  'tags.title',
  () => import('@/components/comfy/dialogs/TagPanel').then((m) => m.TagPanel),
  () => <PartLoading label={t('tags.title')} />,
);

export function TagPanelOverlay(): React.ReactElement | null {
  const open = useTagsStore((state) => state.panelOpen);
  const requestClose = useTagsStore((state) => state.requestClosePanel);
  if (!open) return null;

  return (
    <DialogWindow
      id={TAG_PANEL_DIALOG}
      label={t('tags.title')}
      defaultMode="embedded"
      marks={{ [INSERT_SOURCE_MARK]: '' }}
      onClose={requestClose}
    >
      <TagPanel />
    </DialogWindow>
  );
}
