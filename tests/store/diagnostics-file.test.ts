import { afterEach, describe, expect, it } from 'vitest';

import { clearTrace, traceFault } from '@/lib/trace';
import {
  buildDiagnostics,
  DIAGNOSTICS_KIND,
  diagnosticsFileName,
  formatDiagnostics,
  type DiagnosticsInputs,
} from '@/store/diagnostics/diagnostics-file';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 診断ファイルの組み立て。入れてよい物だけで組む
// ─────────────────────────────

const INPUTS: DiagnosticsInputs = { comfySystem: null, storage: null };

afterEach(() => {
  clearTrace();
  useSettingsStore.setState({ baseUrl: '', llmSystemPrompt: '', loraCopyFormat: '' });
});

describe('buildDiagnostics', () => {
  it('種類の印と失敗を持ち、接続先の URL と自由に書く設定を入れない', () => {
    useSettingsStore.setState({
      baseUrl: 'http://192.168.10.20:8188',
      llmSystemPrompt: 'secret prompt',
      loraCopyFormat: '<lora:secret>',
    });
    traceFault('Card', new Error('boom'));
    const text = formatDiagnostics(buildDiagnostics(INPUTS, new Set()));
    const parsed = JSON.parse(text) as Record<string, unknown>;

    expect(parsed.kind).toBe(DIAGNOSTICS_KIND);
    expect((parsed.faults as { message: string }[])[0]?.message).toBe('boom');
    expect(text).not.toContain('192.168');
    expect(text).not.toContain('secret');
  });

  it('打ち間違えた接続先の値が文面にあれば消す。JSON の鍵は壊さない', () => {
    useSettingsStore.setState({ baseUrl: 'my-pc:8188/comfy' });
    useLlmProfilesStore.setState({
      profiles: [{ id: 'p', baseUrl: '/llm', keyRequired: true, defaultModel: '' }],
    });
    traceFault('接続', new Error('接続先 URL の形式が不正です: my-pc:8188/comfy'));
    const text = formatDiagnostics(buildDiagnostics(INPUTS, new Set()));
    expect(text).not.toContain('my-pc');
    expect((JSON.parse(text) as { llm?: unknown }).llm).toBeDefined();
    useLlmProfilesStore.setState({ profiles: [] });
  });

  it('接続先 URL を選ぶと、利用者名と問い合わせの部分を落として入れる', () => {
    useSettingsStore.setState({ baseUrl: 'http://user:pw@192.168.10.20:8188/?token=abc' });
    useLlmProfilesStore.setState({
      profiles: [
        { id: 'p', baseUrl: 'https://api.example.com/v1', keyRequired: true, defaultModel: '' },
      ],
    });
    useSettingsStore.setState({ llmProfileId: 'p' });
    const text = formatDiagnostics(buildDiagnostics(INPUTS, new Set(['comfyUrl', 'llmUrl'])));
    const parsed = JSON.parse(text) as Record<'comfy' | 'llm', { url?: string | null }>;
    expect(parsed.comfy.url).toBe('http://192.168.10.20:8188');
    expect(parsed.llm.url).toBe('https://api.example.com/v1');
    expect(text).not.toContain('token=abc');
    // ComfyUI の URL だけ外すと、ComfyUI の接続先は文面からも消え、LLM の URL は残る
    const comfyOff = formatDiagnostics(buildDiagnostics(INPUTS, new Set(['llmUrl'])));
    expect(comfyOff).not.toContain('192.168.10.20');
    expect(comfyOff).toContain('api.example.com');
    useLlmProfilesStore.setState({ profiles: [] });
    useSettingsStore.setState({ llmProfileId: null });
  });

  it('選べる区分は選んだときだけ入れ、外せない区分は選ばなくても入れる', () => {
    const without = buildDiagnostics(INPUTS, new Set());
    const withShape = buildDiagnostics(INPUTS, new Set(['definitionSources']));
    type Shape = { comfy: { definitionSources?: { count?: unknown } }; faults?: unknown };
    expect((without as Shape).comfy.definitionSources).toBeUndefined();
    expect(Array.isArray((without as Shape).faults)).toBe(true);
    expect('app' in without).toBe(false);
    expect(typeof (withShape as Shape).comfy.definitionSources?.count).toBe('number');
  });
});

describe('diagnosticsFileName', () => {
  it('利用者の時刻で日時を付ける', () => {
    expect(diagnosticsFileName(new Date(2026, 10, 3, 9, 5, 7))).toBe(
      'kisara-diagnostics-20261103-090507.json',
    );
  });
});
