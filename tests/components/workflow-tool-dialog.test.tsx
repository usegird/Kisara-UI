// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkflowToolDialog } from '@/components/shared/WorkflowToolDialog';
import type { Workflow } from '@/graph/types';

import { definition, definitionMap, widget } from '../helpers/definitions';
import { bareNode } from '../helpers/workflow';

const definitions = definitionMap(definition('Prompt', [widget('text', 'STRING')]));

const workflow: Workflow = {
  nodes: [bareNode({ id: 3, type: 'Prompt', inputs: [{ name: 'in', type: 'IMAGE', link: 1 }] })],
  links: [],
  extra: { ds: { scale: 1 }, linearData: { inputs: [[3, 'text']] } },
};

const place = { tabName: 'Tab', tabId: 'tab-1', path: null };

afterEach(() => {
  cleanup();
});

function renderDialog(onSave?: () => void): { readonly onClose: ReturnType<typeof vi.fn> } {
  const onClose = vi.fn();
  render(
    <WorkflowToolDialog
      open
      onClose={onClose}
      workflow={workflow}
      definitions={definitions}
      workflowName="wf"
      place={place}
      onSave={onSave}
      embeddable={false}
    />,
  );
  return { onClose };
}

const closeButton = (): HTMLElement => screen.getAllByRole('button', { name: '閉じる' })[0]!;

describe('閉じるときの確認', () => {
  it('直していなければそのまま閉じる', () => {
    const { onClose } = renderDialog(vi.fn());
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('直しかけがあれば確かめ、OK で閉じる', () => {
    const { onClose } = renderDialog(vi.fn());
    fireEvent.change(screen.getByRole('textbox', { name: /機能名/ }), {
      target: { value: 'make_image' },
    });
    fireEvent.click(closeButton());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('変更は保存されていませんが閉じても良いですか？')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('直しかけの有無を知らせ、外から確認を求められたら確かめる（やめたら知らせる）', () => {
    const onClose = vi.fn();
    const onCloseCanceled = vi.fn();
    const onDirtyChange = vi.fn();
    const props = {
      open: true,
      onClose,
      onCloseCanceled,
      onDirtyChange,
      workflow,
      definitions,
      workflowName: 'wf',
      place,
      onSave: vi.fn(),
      embeddable: false,
    };
    const { rerender } = render(<WorkflowToolDialog {...props} />);
    fireEvent.change(screen.getByRole('textbox', { name: /機能名/ }), {
      target: { value: 'make_image' },
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    rerender(<WorkflowToolDialog {...props} closeRequested />);
    expect(screen.getByText('変更は保存されていませんが閉じても良いですか？')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onCloseCanceled).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('元の値に戻せば確かめない', () => {
    const { onClose } = renderDialog(vi.fn());
    const name = screen.getByRole('textbox', { name: /機能名/ });
    fireEvent.change(name, { target: { value: 'x' } });
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
