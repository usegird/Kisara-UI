// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '@/components/ui/error-boundary';
import { installFaultHandlers, useFaultStore } from '@/store/use-fault-store';

let broken = true;
function Fragile(): React.ReactElement {
  if (broken) throw new Error('読めない形');
  return <p>描けた</p>;
}

beforeEach(() => {
  broken = true;
  useFaultStore.getState().clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('受け止め口', () => {
  it('描けなかった部品だけを差し替え、隣は描く。帯にも残す', () => {
    render(
      <div>
        <ErrorBoundary label="ノード 1（A）">
          <Fragile />
        </ErrorBoundary>
        <p>隣のノード</p>
      </div>,
    );

    expect(screen.getByRole('alert').textContent).toContain('ノード 1（A）を表示できません');
    expect(screen.getByText('読めない形')).not.toBeNull();
    expect(screen.getByText('隣のノード')).not.toBeNull();
    expect(useFaultStore.getState().faults[0]?.where).toBe('ノード 1（A）');
  });

  it('もう一度表示すると、直っていれば描く', () => {
    render(
      <ErrorBoundary label="列">
        <Fragile />
      </ErrorBoundary>,
    );

    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'もう一度表示する' }));
    expect(screen.getByText('描けた')).not.toBeNull();
  });

  it('作り直す鍵が変わったら、壊れた印を外してもう一度描く', () => {
    const view = render(
      <ErrorBoundary label="列" resetKey={1}>
        <Fragile />
      </ErrorBoundary>,
    );

    broken = false;
    view.rerender(
      <ErrorBoundary label="列" resetKey={2}>
        <Fragile />
      </ErrorBoundary>,
    );
    expect(screen.getByText('描けた')).not.toBeNull();
  });
});

describe('誰も受けなかった失敗', () => {
  it('window に届いた失敗を、描き終わってから帯に回す', async () => {
    const stop = installFaultHandlers(window);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('押した途中で失敗') }));
    stop();
    await Promise.resolve();

    expect(useFaultStore.getState().faults[0]?.message).toBe('押した途中で失敗');
  });
});
