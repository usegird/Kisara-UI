import type { ModelDragText } from '@/components/comfy/flow/dialogs/model-picker-rules';
import type { ModelFile } from '@/graph/model-files';

type PlaceResult = string | null;

export interface ModelPickerDialogProps {
  readonly folder: string;
  readonly dialogId?: string | undefined;
  readonly subtitle: string;
  readonly trigger: React.ReactNode;
  readonly modal?: boolean | undefined;
  readonly placeMode?: 'set' | 'insert' | undefined;
  readonly placeBlocked?: string | null | undefined;
  readonly drag?: ModelDragText | undefined;
  readonly open?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  readonly finalFocus?: React.RefObject<HTMLElement | null> | undefined;
  readonly value: string;
  readonly options: readonly unknown[];
  readonly index: ReadonlyMap<string, ModelFile>;
  readonly baseUrl: string;
  readonly loading: boolean;
  readonly onRefresh: () => void;
  readonly onInsertText?: ((text: string) => void) | undefined;
  readonly onPlace: (value: string, origin: DOMRect | null) => PlaceResult | Promise<PlaceResult>;
}
