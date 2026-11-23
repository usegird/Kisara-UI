// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AccessibilityStatementRow } from '@/components/ui/accessibility-statement';

const CONTACT_FORM_URL = 'https://contact.kisara-ui.com';

afterEach(cleanup);

describe('アクセシビリティ方針', () => {
  it('ご意見の窓口に、フォームを新しいタブで開くリンクを出す', async () => {
    render(
      <ul>
        <AccessibilityStatementRow />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'アクセシビリティ方針' }));
    const dialog = await screen.findByRole('dialog');
    const link = within(dialog).getByRole('link', { name: CONTACT_FORM_URL });
    expect(link.getAttribute('href')).toBe(CONTACT_FORM_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(dialog.textContent).not.toContain('Discussions');
  });
});
