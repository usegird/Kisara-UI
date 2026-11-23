import { INSERT_SOURCE_MARK } from '@/components/comfy/dialogs/insert-target';
import { DialogWindow } from '@/components/ui/dialog-window';
import { lazyPart } from '@/components/ui/lazy-part';
import { PartLoading } from '@/components/ui/part-loading';
import { t } from '@/i18n';
import { STYLE_EDITOR_DIALOG, useStylesStore } from '@/store/use-styles-store';

const StyleEditorPanel = lazyPart<Record<never, never>>(
  'styles.edit',
  () => import('@/components/comfy/dialogs/StyleEditorPanel').then((m) => m.StyleEditorPanel),
  () => <PartLoading label={t('styles.edit')} />,
);

export function StyleEditorOverlay(): React.ReactElement | null {
  const editing = useStylesStore((state) => state.editing !== null);
  const requestClose = useStylesStore((state) => state.requestCloseEditor);
  if (!editing) return null;

  return (
    <DialogWindow
      id={STYLE_EDITOR_DIALOG}
      label={t('styles.title')}
      defaultMode="embedded"
      marks={{ [INSERT_SOURCE_MARK]: '' }}
      onClose={() => requestClose()}
    >
      <StyleEditorPanel />
    </DialogWindow>
  );
}
