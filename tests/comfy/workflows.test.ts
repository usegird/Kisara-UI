import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { userdataFileUrl, userdataListUrl } from '@/comfy/endpoints';
import { parseSavedWorkflows, saveWorkflow, WorkflowNotOwnedError } from '@/comfy/workflows';
import { saveTarget, workflowDisplayName, workflowFileName } from '@/graph/workflow-name';

// ─────────────────────────────
// ComfyUI に保存されたワークフローの読み取り。
// 一覧の応答は `[{path, size, modified, created}]`。文字列配列の形も受ける。
// ─────────────────────────────

describe('保存済みワークフローの一覧', () => {
  it('新しいものから並べる', () => {
    const list = parseSavedWorkflows([
      { path: 'a.json', size: 10, modified: 100 },
      { path: 'sub/b.json', size: 20, modified: 300 },
      { path: 'c.json', size: 30, modified: 200 },
    ]);

    expect(list.map((item) => item.path)).toEqual(['sub/b.json', 'c.json', 'a.json']);
  });

  it('表示名は拡張子とフォルダを落とす', () => {
    const list = parseSavedWorkflows([{ path: 'sub dir/Krea2_T2I.json', modified: 1 }]);

    expect(list[0]?.name).toBe('Krea2_T2I');
    expect(list[0]?.path).toBe('sub dir/Krea2_T2I.json');
  });

  it('文字列だけの旧応答も読める', () => {
    expect(parseSavedWorkflows(['x.json'])).toEqual([
      { path: 'x.json', name: 'x', size: null, modified: null },
    ]);
  });

  it('想定外の形は落とす', () => {
    expect(parseSavedWorkflows(null)).toEqual([]);
    expect(parseSavedWorkflows([{ size: 1 }, 42])).toEqual([]);
  });
});

describe('userdata の URL', () => {
  it('一覧は workflows を再帰で引く', () => {
    expect(userdataListUrl('http://x', 'workflows')).toBe(
      'http://x/userdata?dir=workflows&recurse=true&split=false&full_info=true',
    );
  });

  it('取得は dir とパスをまとめて1つの値としてエンコードする', () => {
    expect(userdataFileUrl('http://x', 'workflows', 'sub dir/Krea2_T2I.json')).toBe(
      'http://x/userdata/workflows%2Fsub%20dir%2FKrea2_T2I.json',
    );
  });

  it('パス接頭辞つきの配置でも壊さない', () => {
    expect(userdataFileUrl('http://x/comfy', 'workflows', 'a.json')).toBe(
      'http://x/comfy/userdata/workflows%2Fa.json',
    );
  });

  it('% を含む名前も、接続先が 2 回ほどいた結果が元の名前に戻る', () => {
    const names = ['50%20a.json', '50%off.json', '100%.json', 'x%2Fy.json', 'sub dir/a b.json'];

    for (const name of names) {
      expect(serverPath(userdataFileUrl('http://x', 'workflows', name))).toBe(`workflows/${name}`);
    }
  });
});

/**
 * 接続先が経路から名前を取り出す手順。1 回ほどき、`%` が残ればもう一度ほどく
 */
function serverPath(url: string): string {
  const once = decodeURIComponent(url.slice(url.indexOf('/userdata/') + '/userdata/'.length));
  // Python の unquote と同じく、16 進 2 桁が続かない % はそのまま残す
  return once.includes('%')
    ? once.replace(/(%[0-9A-Fa-f]{2})+/g, (match) => decodeURIComponent(match))
    : once;
}

// ─────────────────────────────
// 保存。本文は生のまま送り、同名は 409 で弾かれる。
// ─────────────────────────────

describe('ワークフロー名', () => {
  it('表示名は拡張子とフォルダを落とす', () => {
    expect(workflowDisplayName('sub/A_B.json')).toBe('A_B');
    expect(workflowDisplayName('A_B')).toBe('A_B');
  });

  it('保存名は .json を1つだけ付ける', () => {
    expect(workflowFileName(' Krea2_T2I ')).toBe('Krea2_T2I.json');
    expect(workflowFileName('Krea2_T2I.json')).toBe('Krea2_T2I.json');
  });

  it('パスや禁止文字は潰す（別フォルダに書かせない）', () => {
    expect(workflowFileName('a/b:c*?.json')).toBe('a_b_c__.json');
    // % は使える文字なので残す（送るときの符号化は URL の組み立てが持つ）
    expect(workflowFileName('50%20a')).toBe('50%20a.json');
    expect(workflowFileName('   ')).toBe('workflow.json');
  });

  it('制御文字・末尾の . と空白・予約名・長すぎる名前も、どの OS でも置ける形にする', () => {
    expect(workflowFileName('a\u0001b')).toBe('a_b.json');
    expect(workflowFileName('draft...')).toBe('draft.json');
    expect(workflowFileName('CON')).toBe('_CON.json');
    expect(workflowFileName('nul.v2')).toBe('_nul.v2.json');
    expect(workflowFileName('x'.repeat(300))).toBe(`${'x'.repeat(120)}.json`);
  });
});

describe('上書き保存の行き先', () => {
  it('開いた元と同じ名前なら、その場所へ確かめずに書く', () => {
    expect(saveTarget('sub/A.json', 'A')).toEqual({ path: 'sub/A.json', overwrite: true });
  });

  it('保存名で整える文字を含む元でも、名前が同じなら別名にせず元へ書く', () => {
    expect(saveTarget('sub/a:b.json', 'a:b')).toEqual({ path: 'sub/a:b.json', overwrite: true });
  });

  it('整えると別のファイルと同じ名前になるときは、確かめてから書く', () => {
    expect(saveTarget('sub/a:b.json', 'a?b')).toEqual({ path: 'sub/a_b.json', overwrite: false });
  });

  it('名前を変えたら同じフォルダの新しい名前へ、確かめてから書く', () => {
    expect(saveTarget('sub/A.json', 'B')).toEqual({ path: 'sub/B.json', overwrite: false });
    expect(saveTarget('A.json', 'B')).toEqual({ path: 'B.json', overwrite: false });
  });

  it('保存先が無ければ直下へ、確かめてから書く', () => {
    expect(saveTarget(null, 'A')).toEqual({ path: 'A.json', overwrite: false });
  });
});

describe('ComfyUI への保存', () => {
  it('本文をそのまま POST する（上書きしない）', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(new Response('{}')));

    await saveWorkflow('http://x', 'a.json', '{"id":1}', { fetchImpl });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://x/userdata/workflows%2Fa.json?overwrite=false',
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"id":1}');
  });

  it('上書きは書く直前に先を読み、KisaraUI が作ったファイルなら overwrite=true で書く', async () => {
    const fetchImpl = serverWith(Response.json({ extra: { kisara: { created: true } } }));

    await saveWorkflow('http://x', 'a.json', '{}', { overwrite: true, fetchImpl });

    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'POST']);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'http://x/userdata/workflows%2Fa.json?overwrite=true',
    );
  });

  it('上書きする先が KisaraUI の作ったファイルでなければ、書かずに投げる', async () => {
    for (const existing of [Response.json({ nodes: [] }), new Response('not json')]) {
      const fetchImpl = serverWith(existing);

      const error = await saveWorkflow('http://x', 'a.json', '{}', {
        overwrite: true,
        fetchImpl,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WorkflowNotOwnedError);
      expect(error).toMatchObject({ reasonCode: 'workflow-not-owned', params: { path: 'a.json' } });
      expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    }
  });

  it('上書きする先が無くなっていれば、上書きの指定を外して作る', async () => {
    const fetchImpl = serverWith(new Response('', { status: 404 }));

    await saveWorkflow('http://x', 'a.json', '{}', { overwrite: true, fetchImpl });

    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'http://x/userdata/workflows%2Fa.json?overwrite=false',
    );
  });

  it('同名で止まったら、その作り手を添えて投げる', async () => {
    const own = serverWith(Response.json({ extra: { kisara: { created: true } } }), 409);
    const foreign = serverWith(Response.json({}), 409);

    await expect(
      saveWorkflow('http://x', 'a.json', '{}', { fetchImpl: own }),
    ).rejects.toMatchObject({
      owned: true,
      reasonCode: 'workflow-exists',
      params: { path: 'a.json' },
    });
    await expect(
      saveWorkflow('http://x', 'a.json', '{}', { fetchImpl: foreign }),
    ).rejects.toMatchObject({ owned: false });
  });
});

/** 読むと `existing` を返し、書くと `postStatus` を返す接続先 */
function serverWith(existing: Response, postStatus = 200) {
  return vi.fn<FetchLike>((_url, init) =>
    Promise.resolve(
      init?.method === 'POST' ? new Response('{}', { status: postStatus }) : existing.clone(),
    ),
  );
}
