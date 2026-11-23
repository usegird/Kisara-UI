import { useEffect, useRef, useState } from 'react';

import {
  draftOf,
  expressionSetOf,
  type ExpressionDraft,
} from '@/components/llm/dialogs/expression-draft';
import { useAvatarExpressionsStore } from '@/store/use-avatar-expressions-store';
import { useAvatarsStore } from '@/store/use-avatars-store';

interface ExpressionDraftState {
  readonly avatarName: string;
  readonly draft: ExpressionDraft | null;
  readonly unreadable: boolean;
  readonly select: (id: string | null) => void;
  readonly apply: (change: (prev: ExpressionDraft) => ExpressionDraft) => void;
}

export function useExpressionDraft(avatarId: string, onFailed: () => void): ExpressionDraftState {
  const avatar = useAvatarsStore((state) => state.avatars[avatarId]);
  const entry = useAvatarExpressionsStore((state) => state.reads[avatarId]);
  const [draft, setDraft] = useState<ExpressionDraft | null>(null);
  const latest = useRef<ExpressionDraft | null>(null);
  const writing = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    useAvatarExpressionsStore.getState().ensure(avatarId);
  }, [avatarId]);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  const current = entry !== undefined && entry.hash === avatar?.hash ? entry.read : null;
  if (draft === null && current?.kind === 'ok') setDraft(draftOf(current.set));

  const replace = (next: ExpressionDraft): void => {
    latest.current = next;
    setDraft(next);
  };
  return {
    avatarName: avatar?.name ?? '',
    draft,
    unreadable: current?.kind === 'unreadable',
    select: (id) => {
      if (latest.current !== null) replace({ ...latest.current, selectedId: id });
    },
    apply: (change) => {
      const base = latest.current;
      if (base === null) return;
      const next = change(base);
      if (next === base) return;
      replace(next);
      const set = expressionSetOf(next);
      writing.current = writing.current.then(async () => {
        const result = await useAvatarExpressionsStore.getState().save(avatarId, set);
        if (result === 'failed') onFailed();
      });
    },
  };
}
