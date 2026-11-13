import { describe, expect, it } from 'vitest';

import { parseSystemStats } from '@/comfy/schema';

// ─────────────────────────────
// `GET /system_stats` の決めた欄だけを読む。起動オプションは読まない
// ─────────────────────────────

describe('parseSystemStats', () => {
  it('版と機器を読み、起動オプションとメモリの空きは持たない', () => {
    const stats = parseSystemStats({
      system: {
        os: 'posix',
        comfyui_version: '0.3.60',
        python_version: '3.12.3',
        pytorch_version: '2.8.0',
        argv: ['main.py', '--listen', '/home/user/secret'],
        ram_free: 123,
      },
      devices: [{ name: 'cuda:0 RTX', type: 'cuda', vram_total: 24e9, vram_free: 1 }, 'bad'],
    });
    expect(stats?.comfyuiVersion).toBe('0.3.60');
    expect(stats?.devices).toEqual([{ type: 'cuda', name: 'cuda:0 RTX', vramTotal: 24e9 }]);
    expect(JSON.stringify(stats)).not.toContain('secret');
  });

  it('古い版で欄が無ければ null にし、形が違えば全体を null にする', () => {
    expect(parseSystemStats({ system: {} })?.comfyuiVersion).toBeNull();
    expect(parseSystemStats({ devices: [] })).toBeNull();
    expect(parseSystemStats('x')).toBeNull();
  });
});
