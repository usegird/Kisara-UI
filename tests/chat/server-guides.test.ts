import { describe, expect, it } from 'vitest';

import { CLOUD_SERVERS, ollamaAllows, SERVERS } from '@/chat/server-guides';

const ORIGIN = 'https://kisara.example';

function server(key: string) {
  const found = [...SERVERS, ...CLOUD_SERVERS].find((item) => item.key === key);
  if (found === undefined) throw new Error(key);
  return found;
}

describe('サーバーの案内', () => {
  it('Ollama が既定で許すのは localhost・127.0.0.1・0.0.0.0 だけ（ポートは問わない）', () => {
    expect(ollamaAllows('http://localhost:5173')).toBe(true);
    expect(ollamaAllows('http://127.0.0.1:8080')).toBe(true);
    expect(ollamaAllows(ORIGIN)).toBe(false);
    expect(ollamaAllows('not a url')).toBe(false);
  });

  it('Ollama は許されない出どころのときだけ、出どころを入れたコマンドと必須の区分を出す', () => {
    const ollama = server('ollama');
    expect(ollama.cors(true)?.level).toBe('notNeeded');
    expect(ollama.cors(false)?.level).toBe('required');
    expect(ollama.commands(ORIGIN, true).map((sample) => sample.command)).toEqual(['ollama serve']);
    expect(ollama.commands(ORIGIN, false).every((sample) => sample.command.includes(ORIGIN))).toBe(
      true,
    );
  });

  it('出どころを選べるサーバーはコマンドに出どころを入れ、クラウドはキーの発行の場所だけを出す', () => {
    expect(server('llama-cpp').commands(ORIGIN, false)[0]?.command).toContain(ORIGIN);
    expect(server('vllm').modelRequired).toBe(true);
    const cloud = server('openrouter');
    expect(cloud.cors(false)).toBeNull();
    expect(cloud.commands(ORIGIN, false)).toEqual([]);
    expect(cloud.keyAt).toMatch(/^https:\/\//u);
  });
});
