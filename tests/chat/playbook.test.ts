import { describe, expect, it } from 'vitest';

import { assembleParts, PLAYBOOK_ID, SUMMARY_ID } from '@/chat/assemble';
import { serializeConversations } from '@/chat/conversation-file';
import { parseConversations } from '@/chat/conversation-file-parse';
import { appendTurn } from '@/chat/edit';
import { parseChat } from '@/chat/file';
import { NO_SOURCES, stripComments } from '@/chat/macros';
import { BUILTIN_PLAYBOOKS, resolvePlaybook, type PlaybookSendAction } from '@/chat/playbook';
import { parsePlaybook } from '@/chat/playbook-parse';
import { directionOf, directionText } from '@/chat/playbook-text';
import { lookupEntry } from '@/i18n/catalog-shape';
import en from '@/i18n/locales/en.json';
import ja from '@/i18n/locales/ja.json';
import zh from '@/i18n/locales/zh-Hans.json';

import { chat, chatMessage, chatPlaybook, outlineBook, playbookRef } from '../helpers/llm';

// ─────────────────────────────
// プレイブック。フェーズの文と指示の発言の置き場、読み戻し、標準のプレイブックの
// 文言。アウトラインの段・候補・フェーズの文の中身は playbook-outline.test.ts
// ─────────────────────────────

const send: PlaybookSendAction = {
  kind: 'send',
  id: 'w',
  name: 'Write it',
  instruction: 'Write for {{user}}.',
};

describe('送る中身の組み立て', () => {
  const sent = (text = 'Q', instruction?: ReturnType<typeof directionOf>) =>
    assembleParts(
      appendTurn(
        chat([chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', ['A'])], {
          playbook: playbookRef(),
          summary: { content: 'S', upTo: 'a1' },
        }),
        { text, userId: 'u2', assistantId: 'a2', images: [], instruction },
      ),
      chat().prompt,
      // 定義は出どころが引いて渡す（会話は参照だけ）
      { ...NO_SOURCES, userName: 'Kei', playbook: chatPlaybook() },
    );

  it('フェーズの文は要約より前に system で置き、指示の決まりの行を持つ', () => {
    const ids = sent().map((part) => part.itemId);
    expect(ids.indexOf(PLAYBOOK_ID)).toBeLessThan(ids.indexOf(SUMMARY_ID));
    const frame = sent().find((part) => part.itemId === PLAYBOOK_ID);
    expect(frame?.role).toBe('system');
    expect(frame?.content).toContain('<direction> and </direction>');
  });
  it('指示の発言は囲んだ user の発言で送る', () => {
    const text = directionText([send.instruction, 'More rain.']);
    const parts = sent(text, directionOf(send));
    expect(parts.at(-1)).toMatchObject({ role: 'user' });
    expect(parts.at(-1)?.content.split('\n')).toEqual([
      '<direction>',
      'Write for Kei.',
      '',
      'More rain.',
      '</direction>',
    ]);
  });
});

describe('読み戻し', () => {
  const original = appendTurn(
    chat([], {
      playbook: playbookRef('write'),
      lorebooks: [outlineBook(['One', 'Two'], 1)],
    }),
    {
      text: directionText([send.instruction]),
      userId: 'u1',
      assistantId: 'a1',
      images: [],
      instruction: directionOf(send),
    },
  );

  it('ブラウザの置き場の形で、参照・##playbook・指示の発言が戻る', () => {
    const restored = parseChat(JSON.parse(JSON.stringify(original)));
    expect(restored?.playbook).toEqual(original.playbook);
    expect(restored?.lorebooks).toEqual(original.lorebooks);
    expect(restored?.messages[0]?.instruction).toEqual(directionOf(send));
  });

  it('書き出したファイルでも戻る', () => {
    const text = serializeConversations([{ id: 'c1', chat: original }]);
    const restored = parseConversations(JSON.parse(text)).chats[0];
    expect(restored?.playbook).toEqual(original.playbook);
    expect(restored?.messages[0]?.instruction).toEqual(directionOf(send));
  });

  it('プレイブックの無いファイル・読めない形は、プレイブックの無い会話として読む', () => {
    expect(parseChat(JSON.parse(JSON.stringify(chat())))?.playbook).toBeUndefined();
    const raw = JSON.parse(JSON.stringify(chat())) as Record<string, unknown>;
    const broken = { ...raw, playbook: { playbook: { id: 1 } } };
    expect(parseChat(broken)?.playbook).toBeUndefined();
  });
});

describe('プレイブックの定義の読み戻し（自分のプレイブックの一覧）', () => {
  const definition = (): { phases: Record<string, unknown>[] } =>
    JSON.parse(JSON.stringify(chatPlaybook().playbook)) as { phases: Record<string, unknown>[] };

  it('段の選び方が読めないフェーズは、種類から決める（決める段は読むだけ）', () => {
    const raw = definition();
    raw.phases[0]!.outline = 'hide';
    delete raw.phases[1]!.outline;
    raw.phases[1]!.kind = 'close';
    expect(parsePlaybook(raw)?.phases.map((phase) => phase.outline)).toEqual(['readonly', 'multi']);
  });
  it('入力欄に入れる印は送るの操作に戻し、使い道とは併せない', () => {
    const raw = definition();
    (raw.phases[1]!.actions as unknown[]).push({
      kind: 'send',
      id: 'fix',
      name: 'Fix',
      instruction: 'Fix it.',
      revise: true,
      use: 'send',
    });
    const fix = parsePlaybook(raw)?.phases[1]?.actions.find((action) => action.id === 'fix');
    expect(fix).toEqual({
      kind: 'send',
      id: 'fix',
      name: 'Fix',
      instruction: 'Fix it.',
      revise: true,
    });
  });

  it('種類の読めないフェーズ・読めない種類の操作は読み捨てる', () => {
    const raw = definition();
    delete raw.phases[0]!.kind;
    (raw.phases[1]!.actions as unknown[]).push({ kind: 'move', id: 'go', name: 'Go' });
    const restored = parsePlaybook(raw);
    expect(restored?.phases).toHaveLength(1);
    expect(restored?.phases[0]?.actions.map((action) => action.id)).toEqual(['w', 'n']);
  });
});

describe('組み込みのプレイブック', () => {
  it('文言の道筋がすべて英語の表にある', () => {
    // 文言を引くたびに道筋を控える
    const paths: string[] = [];
    for (const shape of BUILTIN_PLAYBOOKS) {
      resolvePlaybook(shape, (path) => {
        paths.push(path);
        return '';
      });
    }
    const missing = paths.filter((path) => typeof lookupEntry(en, path) !== 'string');
    expect(missing).toEqual([]);
  });

  // 役割の文はフェーズの文として送るたびに注記を外すので、外れる囲みを持つと指示が欠ける
  it('役割の文は送るときに欠けず、物語は本文の外の話を <comment> で囲ませる', () => {
    for (const locale of [en, ja, zh]) {
      const text = (path: string): string => {
        const entry = lookupEntry(locale, path);
        return typeof entry === 'string' ? entry : '';
      };
      for (const shape of BUILTIN_PLAYBOOKS) {
        const role = resolvePlaybook(shape, text).role;
        expect(stripComments(role)).toBe(role);
      }
      expect(resolvePlaybook(BUILTIN_PLAYBOOKS[0]!, text).role).toContain('<comment>');
    }
  });

  it('物語の準備の相談は、どの言語でも {{user}} を主人公として前提と人物を作らせる', () => {
    for (const locale of [en, ja, zh]) {
      const entry = lookupEntry(locale, 'llm.playbook.builtin.story.actions.makePlan.instruction');
      const instruction = typeof entry === 'string' ? entry : '';
      // 前置き・前提・人物の 3 か所で主人公を {{user}} と書く
      expect(instruction.split('{{user}}').length - 1).toBeGreaterThanOrEqual(3);
    }
  });

  it('候補を添えて送るの操作はどれもある送るの操作を指す', () => {
    const broken = BUILTIN_PLAYBOOKS.flatMap((shape) => {
      const sends = new Set(
        shape.phases.flatMap((phase) =>
          phase.actions.filter((a) => a.kind === 'send').map((a) => a.id),
        ),
      );
      return shape.phases.flatMap((phase) =>
        phase.actions.flatMap((action) => {
          const target =
            action.kind === 'send' && action.use === 'send' ? action.sendTo : undefined;
          return target !== undefined && !sends.has(target) ? [`${shape.id}.${action.id}`] : [];
        }),
      );
    });
    expect(broken).toEqual([]);
  });

  it('どのプレイブックも構成の相談を開く操作から始まる。プロット進行は相談と書く操作の 1 フェーズ', () => {
    expect(BUILTIN_PLAYBOOKS.map((shape) => shape.phases[0]?.kind)).toEqual([
      'proceed',
      'decide',
      'decide',
      'decide',
      'decide',
    ]);
    expect(BUILTIN_PLAYBOOKS[0]?.phases).toHaveLength(1);
    expect(BUILTIN_PLAYBOOKS.map((shape) => shape.phases[0]?.actions[0]?.kind)).toEqual(
      BUILTIN_PLAYBOOKS.map(() => 'consult'),
    );
  });

  it('引いた文で写せる', () => {
    const playbook = resolvePlaybook(BUILTIN_PLAYBOOKS[0]!, (path) => path);
    expect(playbook.phases[0]?.name).toBe('llm.playbook.builtin.story.phases.writing.name');
    expect(playbook.continue).toBe('llm.playbook.builtin.story.continue');
    expect(playbook.phases[0]?.actions[0]).toMatchObject({
      kind: 'consult',
      greeting: 'llm.playbook.builtin.story.actions.makePlan.greeting',
    });
    // 型は送るの操作として持つ
    expect(playbook.phases[0]?.actions.find((a) => a.id === 'close')).toMatchObject({
      kind: 'send',
      name: 'llm.playbook.builtin.story.actions.close.name',
    });
  });

  it('物語は 1 つで、どの標準のプレイブックも「次の段へ」の操作を持たない', () => {
    expect(BUILTIN_PLAYBOOKS.map((shape) => shape.id)).toEqual([
      'story',
      'roleplay',
      'ideas',
      'research',
      'document',
    ]);
    const kinds = BUILTIN_PLAYBOOKS.flatMap((shape) =>
      shape.phases.flatMap((phase) => phase.actions.map((action) => action.kind)),
    );
    expect(kinds).not.toContain('next');
  });
});
