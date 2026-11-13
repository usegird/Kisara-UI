import { describe, expect, it } from 'vitest';

import type { ConnectionFailureCode } from '@/port/connection';
import { failureGuide, forbiddenRunGuide, launchSample } from '@/queue/connection-guide';

// ─────────────────────────────
// 接続失敗の案内。**CORS 未設定 / ローカルネットワーク拒否 / URL 誤り**で、それぞれ別の実行可能な指示が出ること。
// ─────────────────────────────

const ORIGIN = 'https://kisara.example';

describe('接続失敗の案内', () => {
  it('CORS 未設定には、起動オプションをそのまま示す', () => {
    const guide = failureGuide('cors-or-down', ORIGIN);

    expect(guide.steps.some((step) => step.includes(`--enable-cors-header ${ORIGIN}`))).toBe(true);
  });

  it('オリジンが取れないときは * を示す', () => {
    expect(failureGuide('cors-or-down', '').steps.join('\n')).toContain('--enable-cors-header *');
  });

  it('ローカルネットワーク拒否には、許可の出し方を示す', () => {
    const guide = failureGuide('local-network', ORIGIN);

    expect(guide.steps.some((step) => step.includes('許可'))).toBe(true);
    expect(guide.steps.join('\n')).not.toContain('--enable-cors-header');
  });

  it('URL 誤り（別のものが応答）には、URL の確認を示す', () => {
    const guide = failureGuide('bad-response', ORIGIN);

    expect(guide.steps.some((step) => step.includes('URL'))).toBe(true);
    expect(guide.steps.join('\n')).not.toContain('--enable-cors-header');
  });

  it('CORS 拒否と未起動は別の指示になる', () => {
    const cors = failureGuide('cors', ORIGIN);
    const down = failureGuide('down', ORIGIN);

    expect(cors.steps.join('\n')).toContain(`--enable-cors-header ${ORIGIN}`);
    expect(down.steps.join('\n')).not.toContain('--enable-cors-header');
    expect(down.steps.some((step) => step.includes('起動'))).toBe(true);
  });

  it('応答が無いときは、接続先の名前を挙げる', () => {
    expect(failureGuide('down', ORIGIN, undefined, 'http://x:8188').summary).toBe(
      'http://x:8188 が応答しません',
    );
  });

  it('HTTP エラーは番号を出し、番号ごとに指示が変わる', () => {
    expect(failureGuide('http-error', ORIGIN, 403).summary).toContain('403');
    expect(failureGuide('http-error', ORIGIN, 403).steps.join('\n')).toContain(
      '--enable-cors-header',
    );
    expect(failureGuide('http-error', ORIGIN, 404).steps.join('\n')).toContain('URL');
    expect(failureGuide('http-error', ORIGIN, 500).steps.join('\n')).toContain('コンソール');
    expect(failureGuide('http-error', ORIGIN).summary.length).toBeGreaterThan(0);
  });

  it('主要ケースの案内はすべて内容が異なる', () => {
    const codes: ConnectionFailureCode[] = [
      'cors',
      'down',
      'cors-or-down',
      'local-network',
      'bad-response',
    ];
    const texts = codes.map((code) => {
      const guide = failureGuide(code, ORIGIN);
      return `${guide.summary}\n${guide.steps.join('\n')}`;
    });

    expect(new Set(texts).size).toBe(codes.length);
  });

  it('どのコードでも、手順が空にならない', () => {
    const codes: ConnectionFailureCode[] = [
      'offline',
      'mixed-content',
      'local-network',
      'cors',
      'down',
      'cors-or-down',
      'timeout',
      'http-error',
      'bad-response',
      'unknown',
    ];

    for (const code of codes) {
      const guide = failureGuide(code, ORIGIN);
      expect(guide.summary.length, code).toBeGreaterThan(0);
      expect(guide.steps.length, code).toBeGreaterThan(0);
    }
  });
});

describe('実行が 403 で拒否されたときの案内', () => {
  it('起動オプションをそのまま示す', () => {
    const guide = forbiddenRunGuide(ORIGIN);

    expect(guide.summary).toContain('403');
    expect(guide.steps.some((step) => step.includes(`--enable-cors-header ${ORIGIN}`))).toBe(true);
  });

  it('読み取りは通るのに実行だけ弾かれる点に触れる', () => {
    expect(forbiddenRunGuide(ORIGIN).steps.join('\n')).toContain('読み取り');
  });
});

describe('起動の見本', () => {
  it('main.py の起動に起動オプションを足す。オリジンが無ければ *', () => {
    expect(launchSample('').command).toBe('python main.py --enable-cors-header *');
    expect(launchSample('http://localhost:5173')).toEqual({
      label: 'shell',
      command: 'python main.py --enable-cors-header http://localhost:5173',
    });
  });
});
