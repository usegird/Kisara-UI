import type { ModelPickerDialogProps } from '@/components/comfy/flow/dialogs/model-picker-props';

export type { ModelPickerDialogProps };

export function ModelPickerDialog({ trigger }: ModelPickerDialogProps): React.ReactElement {
  return <>{trigger}</>;
}
