import { useRef } from 'react';

import { customColorPair, type NodeSettingsPatch } from '@/graph/node-settings';
import { toHexColor } from '@/lib/color';

interface ColorPicker {
  readonly open: (current: string | null) => void;
  readonly input: React.ReactNode;
}

export function useColorPicker(
  nodeId: number,
  onSettingsChange: ((id: number, patch: NodeSettingsPatch) => void) | undefined,
): ColorPicker {
  const ref = useRef<HTMLInputElement | null>(null);

  const open = (current: string | null): void => {
    const element = ref.current;
    if (!element) return;
    element.value = (current === null ? null : toHexColor(current)) ?? '#353535';
    try {
      element.showPicker();
    } catch {
      element.click();
    }
  };

  const input = onSettingsChange ? (
    <input
      ref={ref}
      type="color"
      tabIndex={-1}
      aria-hidden
      className="pointer-events-none absolute top-0 right-0 size-0 opacity-0"
      onChange={(event) => {
        const pair = customColorPair(event.target.value);
        if (pair) onSettingsChange(nodeId, pair);
      }}
    />
  ) : null;

  return { open, input };
}
