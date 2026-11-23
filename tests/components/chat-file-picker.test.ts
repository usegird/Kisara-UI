// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pickChatFile } from '@/components/llm/chat-list/chat-file-picker';
import { importChatFile } from '@/store/chat/chat-transfer';
import { openCardFile } from '@/store/chat/preset-import';

vi.mock('@/store/chat/preset-import', () => ({ openCardFile: vi.fn() }));
vi.mock('@/store/chat/chat-transfer', () => ({ importChatFile: vi.fn() }));

const card = vi.mocked(openCardFile);
const chats = vi.mocked(importChatFile);
const RESULT = { added: [], skipped: 0, dropped: 0, full: false, unreadable: true };

function choose(file: File): HTMLInputElement {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
  const create = vi.spyOn(document, 'createElement');
  pickChatFile();
  const input = create.mock.results[0]?.value as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new Event('change'));
  click.mockRestore();
  create.mockRestore();
  return input;
}

beforeEach(() => {
  card.mockReset();
  chats.mockReset();
  chats.mockResolvedValue(RESULT);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('会話の一覧のファイルから開く', () => {
  it('カードの PNG も選べ、カードなら会話のファイルとしては読まない', async () => {
    card.mockResolvedValue(true);
    const input = choose(new File(['x'], 'card.png', { type: 'image/png' }));
    expect(input.accept).toContain('.png');
    await vi.waitFor(() => expect(card).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(chats).not.toHaveBeenCalled();
  });

  it('カードでなければ会話のファイルとして取り込む', async () => {
    card.mockResolvedValue(false);
    choose(new File(['{}'], 'conversations.json'));
    await vi.waitFor(() => expect(chats).toHaveBeenCalledTimes(1));
  });
});
