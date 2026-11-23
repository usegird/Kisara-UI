// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogFrame } from '@/components/ui/dialog';
import { useDialogStore } from '@/store/use-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ dialogLayouts: {} });
  useDialogStore.setState({ embedHost: null, order: [] });
});

function embedded(modal: boolean, onOpenChange = vi.fn()): void {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => useDialogStore.getState().setEmbedHost(host));
  useSettingsStore.setState({ dialogLayouts: { f: { mode: 'embedded' } } });
  render(
    <DialogFrame id="f" open modal={modal} onOpenChange={onOpenChange} size="md" title="枠">
      <p>中身</p>
    </DialogFrame>,
  );
}

describe('閉じている枠の描き直し', () => {
  it('ほかのダイアログを開け閉めしても、閉じている枠は描き直さない', () => {
    let commits = 0;
    render(
      <Profiler id="closed" onRender={() => (commits += 1)}>
        <DialogFrame id="closed" open={false} onOpenChange={vi.fn()} size="md" title="閉">
          <p>閉じた中身</p>
        </DialogFrame>
      </Profiler>,
    );
    const before = commits;
    for (let round = 0; round < 5; round += 1) {
      act(() => useDialogStore.getState().raise(`other-${String(round)}`, 'floating'));
      act(() => useDialogStore.getState().remove(`other-${String(round)}`));
    }
    expect(commits).toBe(before);
  });
});

describe('焦点を閉じ込める枠', () => {
  it('埋め込みでも画面全体を暗くし、外（幕）を押したら閉じる', async () => {
    const onOpenChange = vi.fn();
    embedded(true, onOpenChange);
    await screen.findByText('中身');

    const backdrop = document.querySelector<HTMLElement>('[data-dialog-backdrop]');
    expect(backdrop?.className).toContain('fixed');
    expect(backdrop?.className).toContain('bg-black/40');

    fireEvent.click(backdrop as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('閉じ込めない呼び出しでは暗くしない', async () => {
    embedded(false);
    await screen.findByText('中身');

    expect(document.querySelector('[data-dialog-backdrop]')).toBeNull();
  });
});

describe('小さいダイアログ', () => {
  it('帯の右端は × だけで、埋め込みを残していても自由移動で出す', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    act(() => useDialogStore.getState().setEmbedHost(host));
    useSettingsStore.setState({ dialogLayouts: { s: { mode: 'embedded' } } });
    render(
      <DialogFrame id="s" open onOpenChange={vi.fn()} size="sm" title="小">
        <p>中身</p>
      </DialogFrame>,
    );
    await screen.findByText('中身');

    const header = document.querySelector('[data-dialog-header]');
    expect([...(header?.querySelectorAll('button') ?? [])].map((b) => b.ariaLabel)).toEqual([
      '閉じる',
    ]);
    expect(document.querySelector<HTMLElement>('[data-dialog-backdrop]')?.className).toContain(
      'z-50',
    );
  });
});

describe('自由移動の前後', () => {
  it('閉じ込めないものは後から開いたものが前で、押すと前に出る', async () => {
    const { rerender } = render(
      <DialogFrame id="a" open modal={false} onOpenChange={vi.fn()} size="md" title="A">
        <p>中身 A</p>
      </DialogFrame>,
    );
    rerender(
      <>
        <DialogFrame id="a" open modal={false} onOpenChange={vi.fn()} size="md" title="A">
          <p>中身 A</p>
        </DialogFrame>
        <DialogFrame id="b" open modal={false} onOpenChange={vi.fn()} size="md" title="B">
          <p>中身 B</p>
        </DialogFrame>
      </>,
    );
    const a = (await screen.findByText('中身 A')).closest<HTMLElement>('[role="dialog"]');
    const b = (await screen.findByText('中身 B')).closest<HTMLElement>('[role="dialog"]');
    const z = (element: HTMLElement | null): number => Number(element?.style.zIndex);
    expect(z(b)).toBeGreaterThan(z(a));

    fireEvent.pointerDown(a as HTMLElement);
    expect(z(a)).toBeGreaterThan(z(b));
  });
});

describe('漏れ', () => {
  it('開け閉めを繰り返しても、閉じた枠を残さない', async () => {
    const leak = leakWatch();
    const frame = (open: boolean): React.ReactElement | null =>
      open ? (
        <DialogFrame id="f" open modal onOpenChange={vi.fn()} size="md" title="枠">
          <p>中身</p>
        </DialogFrame>
      ) : null;
    const { rerender } = render(frame(false));

    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        rerender(frame(true));
        await Promise.resolve();
      });
      leak.watch(await screen.findByRole('dialog'));
      await act(async () => {
        rerender(frame(false));
        await Promise.resolve();
      });
    }

    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
