// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TagCompleteList } from '@/components/comfy/flow/TagCompleteList';
import { indexTags } from '@/graph/tag-dictionary';
import { useTagComplete } from '@/hooks/flow/use-tag-complete';
import { insertAtCaret, insertQuietly } from '@/lib/insert-at-caret';
import { useTagsStore } from '@/store/use-tags-store';

import { tagEntry } from '../helpers/tags';

const scrollIntoView = vi.fn<(this: Element) => void>();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  const entries = [tagEntry('long_hair', 900), tagEntry('blue_hair', 10), tagEntry('smile', 5)];
  useTagsStore.setState({ merged: indexTags(entries, null) });
});

afterEach(() => {
  cleanup();
  useTagsStore.setState({ merged: [] });
});

function Field({ enabled = true }: { readonly enabled?: boolean }) {
  const complete = useTagComplete(enabled);
  return (
    <>
      <textarea
        aria-label="prompt"
        {...complete.field}
        onKeyDown={(event) => {
          complete.onKeyDown(event);
        }}
      />
      <TagCompleteList complete={complete} />
    </>
  );
}

function type(field: HTMLTextAreaElement, value: string): void {
  field.focus();
  field.value = value;
  field.setSelectionRange(value.length, value.length);
  fireEvent.input(field);
}

function field(): HTMLTextAreaElement {
  return screen.getByLabelText<HTMLTextAreaElement>('prompt');
}

describe('タグ補完', () => {
  it('打ちかけの語に当たるタグを、先頭から一致 → 途中に含む の順に出す', () => {
    render(<Field />);
    type(field(), '1girl, hair');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'long_hair900',
      'blue_hair10',
    ]);
  });

  it('打った語ではない差し込み（Lora・落とした文字）では出さない', () => {
    render(<Field />);
    field().focus();
    insertQuietly(field(), 'hair');
    expect(field().value).toBe('hair');
    expect(screen.queryByRole('listbox')).toBeNull();

    insertAtCaret(field(), ', hair');
    expect(screen.queryByRole('listbox')).not.toBeNull();
  });

  it('↓ で選び、Enter で語を置き換えて , を足す', () => {
    render(<Field />);
    type(field(), 'smile, lon');

    expect(field().getAttribute('aria-activedescendant')).not.toBeNull();
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(field().value).toBe('smile, long hair, ');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('頭の @ は無視して当て、入れても @ を残す', () => {
    render(<Field />);
    type(field(), 'smile, @lon');
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(field().value).toBe('smile, @long hair, ');
  });

  it('↓ で選んだ行を一覧の見える範囲へ入れる', () => {
    render(<Field />);
    type(field(), 'hair');
    fireEvent.keyUp(field());
    scrollIntoView.mockClear();

    fireEvent.keyDown(field(), { key: 'ArrowDown' });

    const active = screen.getAllByRole('option')[1];
    expect(active?.getAttribute('aria-selected')).toBe('true');
    expect(scrollIntoView.mock.contexts).toContain(active);
  });

  it('Esc で閉じ、同じ語では出し直さない', () => {
    render(<Field />);
    type(field(), 'smi');
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();

    type(field(), 'smi');
    expect(screen.queryByRole('listbox')).toBeNull();
    type(field(), 'smil');
    expect(screen.getByRole('listbox')).not.toBeNull();
  });

  it('変換中と、補完を付けない欄では出さない', () => {
    const { unmount } = render(<Field />);
    fireEvent.compositionStart(field());
    type(field(), 'smi');
    expect(screen.queryByRole('listbox')).toBeNull();
    unmount();

    render(<Field enabled={false} />);
    type(field(), 'smi');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
