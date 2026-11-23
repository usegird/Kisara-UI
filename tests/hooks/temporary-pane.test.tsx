// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTemporaryPane } from '@/hooks/ui/use-temporary-pane';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

const PIN_KEY = 'test:directory';

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ dialogPanePins: {} });
});

function Pane(): React.ReactElement {
  const { pinned, shown, state, cycle, hide, overlay, closesOnPointer, closesOnKey } =
    useTemporaryPane(PIN_KEY);
  const onPointerDown = (event: React.PointerEvent): void => {
    if (closesOnPointer(event.target)) hide();
  };
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (closesOnKey(event.key)) hide();
  };
  return (
    <div onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
      <p data-testid="state">{state}</p>
      <button type="button" data-directory-toggle onClick={cycle}>
        切り替え
      </button>
      <p data-testid="outside">外</p>
      {shown && !pinned ? (
        <div ref={overlay} role="navigation" aria-label="一時的な列">
          <button type="button">中</button>
        </div>
      ) : null}
    </div>
  );
}

const stateText = (): string | null => screen.getByTestId('state').textContent;

describe('巡り', () => {
  it('一時的に出す → ピン止め → 隠すと巡り、ピン止めは端末に残す', () => {
    render(<Pane />);
    const toggle = screen.getByRole('button', { name: '切り替え' });
    expect(stateText()).toBe('hidden');
    fireEvent.click(toggle);
    expect(stateText()).toBe('shown');
    fireEvent.click(toggle);
    expect(stateText()).toBe('pinned');
    expect(useSettingsStore.getState().dialogPanePins[PIN_KEY]).toBe(true);
    fireEvent.click(toggle);
    expect(stateText()).toBe('hidden');
    expect(useSettingsStore.getState().dialogPanePins[PIN_KEY]).not.toBe(true);
  });
});

describe('閉じる', () => {
  it('列の外を押すと閉じ、列の中と切り替えのアイコンでは閉じない', () => {
    render(<Pane />);
    fireEvent.click(screen.getByRole('button', { name: '切り替え' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: '中' }));
    expect(stateText()).toBe('shown');
    fireEvent.pointerDown(screen.getByRole('button', { name: '切り替え' }));
    expect(stateText()).toBe('shown');
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(stateText()).toBe('hidden');
  });

  it('出している間の Esc で閉じる', () => {
    render(<Pane />);
    fireEvent.click(screen.getByRole('button', { name: '切り替え' }));
    fireEvent.keyDown(screen.getByRole('button', { name: '中' }), { key: 'Enter' });
    expect(stateText()).toBe('shown');
    fireEvent.keyDown(screen.getByRole('button', { name: '中' }), { key: 'Escape' });
    expect(stateText()).toBe('hidden');
  });
});

describe('幅で決める既定のピン止め', () => {
  let notify: ((width: number) => void) | null = null;
  class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      notify = (width) =>
        callback(
          [{ contentRect: { width } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
    }
    observe(): void {}
    disconnect(): void {
      notify = null;
    }
  }

  function WidePane(): React.ReactElement {
    const { state, cycle, attachFrame } = useTemporaryPane(PIN_KEY, 800);
    return (
      <div ref={attachFrame}>
        <p data-testid="state">{state}</p>
        <button type="button" data-directory-toggle onClick={cycle}>
          切り替え
        </button>
      </div>
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    notify = null;
  });

  it('一度も切り替えていなければ、枠が 800px 以上の間だけピン止めで出す', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    render(<WidePane />);
    expect(stateText()).toBe('hidden');
    act(() => notify?.(900));
    expect(stateText()).toBe('pinned');
    act(() => notify?.(799));
    expect(stateText()).toBe('hidden');
  });

  it('切り替えたら、幅に関わらずその設定に従う', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    render(<WidePane />);
    act(() => notify?.(900));
    fireEvent.click(screen.getByRole('button', { name: '切り替え' }));
    expect(useSettingsStore.getState().dialogPanePins[PIN_KEY]).toBe(false);
    act(() => notify?.(1200));
    expect(stateText()).toBe('hidden');
  });
});

describe('漏れ', () => {
  it('出し入れを繰り返しても、閉じた列を残さない', async () => {
    const leak = leakWatch();
    render(<Pane />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '切り替え' }));
      });
      leak.watch(screen.getByRole('navigation', { name: '一時的な列' }));
      act(() => {
        fireEvent.pointerDown(screen.getByTestId('outside'));
      });
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
