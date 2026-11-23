// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { InsertCaretMarker } from '@/components/ui/insert-caret-marker';
import { INSERT_CARET_MARK } from '@/lib/text-drag-session';

afterEach(cleanup);

describe('欄の上の挿入位置のアイコン', () => {
  it('掴めず、指す操作を受けない（語のダブルクリックなどを欄が受ける）', () => {
    const field = document.createElement('textarea');
    document.body.append(field);
    render(<InsertCaretMarker field={field} />);
    const marker = document.body.querySelector(`[${INSERT_CARET_MARK}]`);
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute('draggable')).toBeNull();
    expect(marker?.classList.contains('pointer-events-none')).toBe(true);
    expect(marker?.getAttribute('title')).toBeNull();
    field.remove();
  });
});
