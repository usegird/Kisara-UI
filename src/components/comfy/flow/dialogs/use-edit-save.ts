import { useState } from 'react';

export type SaveState =
  | { readonly kind: 'idle' | 'saving' | 'saved' }
  | { readonly kind: 'failed'; readonly error: string };

interface EditSave {
  readonly editing: boolean;
  readonly dirty: boolean;
  readonly saveState: SaveState;
  readonly onEdit: () => void;
  readonly onSave: () => Promise<void>;
  readonly onChanged: () => void;
}

interface EditSaveOptions {
  readonly dirty: boolean;
  readonly save: () => Promise<string | null>;
  readonly focus: () => void;
}

export function useEditSave({ dirty, save, focus }: EditSaveOptions): EditSave {
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  const onEdit = (): void => {
    setEditing(true);
    setSaveState({ kind: 'idle' });
    focus();
  };

  const onSave = async (): Promise<void> => {
    if (!dirty) {
      setEditing(false);
      return;
    }
    setSaveState({ kind: 'saving' });
    const error = await save();
    if (error !== null) {
      setSaveState({ kind: 'failed', error });
      return;
    }
    setSaveState({ kind: 'saved' });
    setEditing(false);
  };

  const onChanged = (): void => setSaveState({ kind: 'idle' });
  return { editing, dirty, saveState, onEdit, onSave, onChanged };
}
