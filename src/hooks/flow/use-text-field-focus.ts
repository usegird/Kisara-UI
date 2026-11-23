import { useEffect, useRef, useState } from 'react';

import { isTextField, type TextField } from '@/lib/insert-at-caret';

const INPUT_EVENTS = ['pointerdown', 'keydown'] as const;

let handoff: TextField | null = null;
let watching = 0;

function focusedField(accept: (field: TextField) => boolean): TextField | null {
  const active = globalThis.document.activeElement;
  return active !== null && isTextField(active) && accept(active) ? active : null;
}

function dropHandoffOnNextInput(): void {
  const doc = globalThis.document;
  const drop = (): void => {
    for (const type of INPUT_EVENTS) doc.removeEventListener(type, drop, true);
    if (watching === 0) handoff = null;
  };
  for (const type of INPUT_EVENTS) doc.addEventListener(type, drop, true);
}

function startingField(accept: (field: TextField) => boolean): TextField | null {
  const focused = focusedField(accept);
  if (focused !== null) return focused;
  return handoff?.isConnected === true && accept(handoff) ? handoff : null;
}

export function useTextFieldWhile(
  accept: (field: TextField) => boolean,
  active: boolean,
): TextField | null {
  const [field, setField] = useState<TextField | null>(() =>
    active ? startingField(accept) : null,
  );
  const change = useChangeOnly(field, setField);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    setField(active ? startingField(accept) : null);
  }

  useEffect(() => {
    if (active && field !== null) handoff = field;
  }, [active, field]);

  useEffect(() => {
    if (!active) return;
    watching++;
    return () => {
      watching--;
      if (watching === 0) dropHandoffOnNextInput();
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onFocus = (event: FocusEvent): void => {
      const target = event.target;
      if (target instanceof Element && isTextField(target) && accept(target)) change(target);
    };
    globalThis.document.addEventListener('focusin', onFocus);
    return () => globalThis.document.removeEventListener('focusin', onFocus);
  }, [accept, active, change]);

  return active && field?.isConnected === true ? field : null;
}

function useChangeOnly(
  value: TextField | null,
  set: (next: TextField | null) => void,
): (next: TextField | null) => void {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const [change] = useState(() => (next: TextField | null): void => {
    if (next !== latest.current) set(next);
  });
  return change;
}
