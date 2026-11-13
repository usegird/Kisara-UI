// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WidgetControl } from '@/components/comfy/flow/WidgetControl';
import { CHECKPOINT_FOLDER, LORA_FOLDER } from '@/graph/model-files';
import type { NodeRow } from '@/graph/rows';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useModelFilesStore } from '@/store/use-model-files-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { modelFile, modelFolder } from '../helpers/model-files';
import { nodeRow } from '../helpers/views';

// ─────────────────────────────
// パラメータ1つ分の編集。カードと App 列で同じ部品を使うので、両方の出し方を確かめる。
// ─────────────────────────────

afterEach(() => {
  cleanup();
});

function row(overrides: Partial<NodeRow> = {}): NodeRow {
  return nodeRow({
    name: 'text',
    label: 'text',
    type: 'STRING',
    value: '元の値',
    target: { kind: 'node', nodeId: 1, classType: 'CLIPTextEncode' },
    widgetName: 'text',
    multiline: true,
    ...overrides,
  });
}

describe('カード側', () => {
  it('複数行は複数行のまま編集する', () => {
    render(<WidgetControl row={row()} onCommit={vi.fn()} />);

    expect(screen.getByLabelText('text').tagName).toBe('TEXTAREA');
  });

  it('選んで離れただけ（中身が同じ）なら書かない（変更の印を付けない）', () => {
    const onCommit = vi.fn();
    render(<WidgetControl row={row()} onCommit={onCommit} />);

    const field = screen.getByLabelText('text');
    fireEvent.focus(field);
    fireEvent.blur(field);
    // 打って元に戻した場合も同じ
    fireEvent.change(field, { target: { value: '元の値x' } });
    fireEvent.change(field, { target: { value: '元の値' } });
    fireEvent.blur(field);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('打ちかけの間だけ枠を濃くし、Ctrl+S で欄を離れずに確定する', () => {
    const onCommit = vi.fn();
    render(<WidgetControl row={row()} onCommit={onCommit} />);

    const field = screen.getByLabelText('text');
    expect(field.className).not.toContain('border-edited');
    fireEvent.change(field, { target: { value: '新しい値' } });
    expect(field.className).toContain('border-edited');

    fireEvent.keyDown(field, { key: 's', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith(expect.anything(), '新しい値');
  });

  it('Ctrl+↑↓ で選んだ範囲の重みを増減し、括弧の中・語の上ならキャレットだけでも増減する', () => {
    render(<WidgetControl row={row({ value: 'cat, dog' })} onCommit={vi.fn()} />);
    const field = screen.getByLabelText<HTMLTextAreaElement>('text');
    field.focus();

    field.setSelectionRange(0, 3);
    fireEvent.keyDown(field, { key: 'ArrowUp', ctrlKey: true });
    expect(field.value).toBe('(cat:1.1), dog');
    expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe('cat');

    field.setSelectionRange(2, 2);
    fireEvent.keyDown(field, { key: 'ArrowDown', ctrlKey: true });
    expect(field.value).toBe('cat, dog');

    // 括弧の外でも、キャレットが語の上ならその語を包む
    field.setSelectionRange(6, 6);
    fireEvent.keyDown(field, { key: 'ArrowUp', ctrlKey: true });
    expect(field.value).toBe('cat, (dog:1.1)');
    expect(field.selectionStart).toBe(7);

    // 語の上でなければ何もしない
    field.setSelectionRange(4, 4);
    fireEvent.keyDown(field, { key: 'ArrowUp', ctrlKey: true });
    expect(field.value).toBe('cat, (dog:1.1)');
  });

  it('読み取り専用のときは入力を薄く出す（ラベルは呼び出し側なので触らない）', () => {
    const { container } = render(<WidgetControl row={row()} onCommit={vi.fn()} readOnly />);

    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('span.opacity-60')?.textContent).toBe('元の値');
  });
});

describe('外から値とプレースホルダを渡したとき（App 列）', () => {
  it('複数行はそのまま複数行で編集する', () => {
    render(<WidgetControl row={row()} onCommit={vi.fn()} value="" placeholder="元の値" />);

    expect(screen.getByLabelText('text').tagName).toBe('TEXTAREA');
  });

  it('渡した値を出し、カード側の値はプレースホルダに回す', () => {
    render(<WidgetControl row={row()} onCommit={vi.fn()} value="" placeholder="元の値" />);
    const field = screen.getByLabelText('text');

    expect(field.getAttribute('placeholder')).toBe('元の値');
    expect((field as HTMLTextAreaElement).value).toBe('');
  });

  it('入力した値をそのまま渡す（カード側には触らない）', () => {
    const onCommit = vi.fn();
    render(<WidgetControl row={row()} onCommit={onCommit} value="" placeholder="元の値" />);

    const field = screen.getByLabelText('text');
    fireEvent.change(field, { target: { value: '新しい値' } });
    fireEvent.blur(field);

    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ name: 'text' }), '新しい値');
  });

  it('空にして離れたら空を渡す（呼び出し側で「未入力」に戻す）', () => {
    const onCommit = vi.fn();
    render(<WidgetControl row={row()} onCommit={onCommit} value="入力済み" placeholder="元の値" />);

    const field = screen.getByLabelText('text');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);

    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ name: 'text' }), '');
  });
});

describe('選択肢（COMBO）', () => {
  const combo = (): NodeRow =>
    row({
      name: 'ckpt_name',
      label: 'ckpt_name',
      type: 'COMBO',
      multiline: false,
      value: 'a.safetensors',
      options: ['a.safetensors', 'b.safetensors'],
    });

  it('未入力なら、ノードの値を薄く出す（選ぶまではそれが使われる）', () => {
    render(<WidgetControl row={combo()} onCommit={vi.fn()} value="" placeholder="a.safetensors" />);
    const field = screen.getByLabelText<HTMLSelectElement>('ckpt_name');

    expect(field.value).toBe('');
    expect(field.className).toContain('text-muted-foreground');
    // 「未入力」の項目としても出るので、選び直せば戻せる
    expect([...field.options].map((option) => option.text)).toContain('a.safetensors');
  });

  it('選択肢に無い値は先頭の選択肢に見せかけず、実際の値を失敗の色で出す', () => {
    render(<WidgetControl row={combo()} onCommit={vi.fn()} value="Select Wildcard 🟢" />);
    const field = screen.getByLabelText<HTMLSelectElement>('ckpt_name');

    expect(field.value).toBe('Select Wildcard 🟢');
    expect(field.selectedOptions[0]?.text).toBe('Select Wildcard 🟢');
    expect(field.className).toContain('text-destructive');
  });

  it('選ぶとその値を渡し、薄い表示をやめる', () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <WidgetControl row={combo()} onCommit={onCommit} value="" placeholder="a.safetensors" />,
    );

    fireEvent.change(screen.getByLabelText('ckpt_name'), {
      target: { value: 'b.safetensors' },
    });
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ckpt_name' }),
      'b.safetensors',
    );

    rerender(
      <WidgetControl
        row={combo()}
        onCommit={onCommit}
        value="b.safetensors"
        placeholder="a.safetensors"
      />,
    );
    expect(screen.getByLabelText('ckpt_name').className).not.toContain('text-muted-foreground');
  });

  it('カード側では「未入力」の項目を出さない', () => {
    render(<WidgetControl row={combo()} onCommit={vi.fn()} />);
    const field = screen.getByLabelText<HTMLSelectElement>('ckpt_name');

    expect(field.options).toHaveLength(2);
  });

  it('選択肢が未取得のときも、ノードの値を薄く出す', () => {
    render(
      <WidgetControl
        row={row({ ...combo(), options: null })}
        onCommit={vi.fn()}
        onNeedOptions={vi.fn()}
        value=""
        placeholder="a.safetensors"
      />,
    );
    const field = screen.getByLabelText('ckpt_name（選択肢を読み込む）');

    expect(field.textContent).toBe('a.safetensors');
    expect(field.className).toContain('text-muted-foreground');
  });
});

// ─────────────────────────────
// モデルのディレクトリを参照する選択肢はカードで選ぶ。
// 判定は選択肢と一覧の突き合わせだけ。ノード名では分岐しない
// ─────────────────────────────

describe('モデルの選択', () => {
  const loraRow = (): NodeRow =>
    row({
      name: 'lora_name',
      label: 'lora_name',
      type: 'COMBO',
      multiline: false,
      value: 'style\\a.safetensors',
      options: ['style\\a.safetensors', 'b.safetensors'],
    });

  const checkpointRow = (): NodeRow =>
    row({
      name: 'ckpt_name',
      label: 'ckpt_name',
      type: 'COMBO',
      multiline: false,
      value: 'sdxl.safetensors',
      options: ['sdxl.safetensors'],
    });

  function seed(folder: string, names: readonly string[]): void {
    const entry = modelFolder(names.map((name) => modelFile(name)));
    const folders = new Map(useModelFilesStore.getState().folders);
    folders.set(folder, entry);

    useModelFilesStore.setState({ folders });
  }

  afterEach(() => {
    useModelFilesStore.getState().clear();
    useSettingsStore.getState().setModelCardHeight(240);
    useSettingsStore.getState().setModelSort({ key: 'name', ascending: true });
    useSettingsStore.setState({ dialogPaneDocks: {} });
  });

  it('情報は右と下を切り替え、置き場を呼び出し元ごとに残す', async () => {
    seed(LORA_FOLDER, ['style/a.safetensors', 'b.safetensors']);
    render(<WidgetControl row={loraRow()} onCommit={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('lora_name（Loraを選ぶ）'));
    expect(await screen.findByRole('separator', { name: '情報の幅' })).toBeDefined();

    // 右に置いたときの置き場の切り替えは、情報の右下に浮かせている
    fireEvent.click(await screen.findByRole('button', { name: '情報を下に出す' }));

    expect(screen.getByRole('separator', { name: '情報の高さ' })).toBeDefined();
    expect(await screen.findByLabelText('モデルの情報')).toBeDefined();
    // 名前の写し取りは、同じ文字を出しているパスの右（名前だけの行は置かない）
    const copy = screen.getByRole('button', { name: 'a の名前を写す' });
    expect(copy.parentElement?.textContent).toContain('パスstyle/a.safetensors');
    expect(useSettingsStore.getState().dialogPaneDocks).toEqual({ 'model-picker:info': 'bottom' });
  });

  it('lora の一覧と合えば、カードを押して選び、決定で書き込んで閉じる', async () => {
    seed(LORA_FOLDER, ['style/a.safetensors', 'b.safetensors']);
    const onCommit = vi.fn();
    render(<WidgetControl row={loraRow()} onCommit={onCommit} />);

    fireEvent.click(screen.getByLabelText('lora_name（Loraを選ぶ）'));
    const card = await screen.findByTitle('b.safetensors');

    // カードの高さは設定から来る（画像の有無で変えない）
    expect(card.closest('div')?.style.height).toBe('240px');

    // 押すだけでは書き込まない（選んで情報を出す）
    fireEvent.click(card);
    expect(onCommit).not.toHaveBeenCalled();
    expect((await screen.findByLabelText('モデルの情報')).textContent).toContain('b.safetensors');

    fireEvent.click(screen.getByRole('button', { name: /を決定する$/ }));

    // 書き込むのは選択肢の文字列そのもの（一覧側の表記に置き換えない）
    expect(onCommit.mock.calls[0]?.[1]).toBe('b.safetensors');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('パラメータ行から開くと焦点を閉じ込め、カードは掴めない', async () => {
    seed(LORA_FOLDER, ['style/a.safetensors', 'b.safetensors']);
    render(<WidgetControl row={loraRow()} onCommit={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('lora_name（Loraを選ぶ）'));
    const dialog = await screen.findByRole('dialog');

    // 閉じ込めているので、外側は基盤が触れなくする（印が付く）
    expect(document.querySelector('[data-base-ui-inert]')).not.toBeNull();
    expect(dialog.querySelector('[draggable="true"]')).toBeNull();
  });

  it('開いたときはいまの値を選んでいる。選んでいなければ決定は押せない', async () => {
    seed(LORA_FOLDER, ['style/a.safetensors', 'b.safetensors']);
    render(<WidgetControl row={loraRow()} onCommit={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('lora_name（Loraを選ぶ）'));
    const place = await screen.findByRole<HTMLButtonElement>('button', { name: /を決定する$/ });
    expect((await screen.findByLabelText('モデルの情報')).textContent).toContain('a.safetensors');
    expect(place.disabled).toBe(false);

    // 情報の × で選択を外す
    fireEvent.click(screen.getByLabelText('情報を閉じる'));
    expect(place.disabled).toBe(true);
  });

  it('アプリ入力の列では、値が入っていれば箱の × で未入力に戻せる', () => {
    seed(LORA_FOLDER, ['style/a.safetensors', 'b.safetensors']);
    const onCommit = vi.fn();
    const { rerender } = render(
      <WidgetControl row={loraRow()} onCommit={onCommit} placeholder="カードの値" />,
    );

    fireEvent.click(screen.getByLabelText('lora_nameを未入力に戻す'));
    expect(onCommit.mock.calls[0]?.[1]).toBe('');
    // ダイアログは開かない
    expect(screen.queryByRole('dialog')).toBeNull();

    // 未入力なら × は出さない
    rerender(
      <WidgetControl row={loraRow()} onCommit={onCommit} placeholder="カードの値" value="" />,
    );
    expect(screen.queryByLabelText('lora_nameを未入力に戻す')).toBeNull();
  });

  it('カードでは × で空にし、空は「未選択」と薄く出す', () => {
    seed(LORA_FOLDER, ['style/a.safetensors', 'b.safetensors']);
    const onCommit = vi.fn();
    const { rerender } = render(<WidgetControl row={loraRow()} onCommit={onCommit} />);

    fireEvent.click(screen.getByLabelText('lora_nameを空にする'));
    expect(onCommit.mock.calls[0]?.[1]).toBe('');

    rerender(<WidgetControl row={{ ...loraRow(), value: '' }} onCommit={onCommit} />);
    expect(screen.getByLabelText('lora_name（Loraを選ぶ）').textContent).toBe('未選択');
    expect(screen.queryByLabelText('lora_nameを空にする')).toBeNull();
  });

  it('モデル（checkpoints）も同じダイアログで選ぶ', async () => {
    seed(LORA_FOLDER, ['b.safetensors']);
    seed(CHECKPOINT_FOLDER, ['sdxl.safetensors']);
    const onCommit = vi.fn();
    render(<WidgetControl row={checkpointRow()} onCommit={onCommit} />);

    fireEvent.click(screen.getByLabelText('ckpt_name（モデルを選ぶ）'));
    const dialog = await screen.findByRole('dialog');
    // ダブルクリックは配置と同じ
    // 開いたときはいまの値のカードを選んでいる
    fireEvent.doubleClick(within(dialog).getByRole('button', { name: /いまの値/ }));

    expect(onCommit.mock.calls[0]?.[1]).toBe('sdxl.safetensors');
  });

  it('カードの高さは上下つきの入力で変える', async () => {
    seed(LORA_FOLDER, ['style/a.safetensors', 'b.safetensors']);
    render(<WidgetControl row={loraRow()} onCommit={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('lora_name（Loraを選ぶ）'));
    const height = await screen.findByLabelText<HTMLInputElement>('カードの高さ（px）');
    expect(height.step).toBe('30');

    fireEvent.change(height, { target: { value: '300' } });

    expect(screen.getByTitle('b.safetensors').closest('div')?.style.height).toBe('300px');
  });

  it('並び替えと高さは、別の選択肢から開いた画面にも同じ値で出す', async () => {
    seed(LORA_FOLDER, ['style/a.safetensors', 'b.safetensors']);
    const first = render(<WidgetControl row={loraRow()} onCommit={vi.fn()} />);
    const second = render(<WidgetControl row={loraRow()} onCommit={vi.fn()} />);

    fireEvent.click(within(first.container).getByLabelText('lora_name（Loraを選ぶ）'));
    // 選んでいない種類は押すと昇順。選んでいるものをもう一度押すと降順
    fireEvent.click(await screen.findByLabelText('大きさで並べる'));
    fireEvent.click(screen.getByLabelText('大きさ・昇順（押すと降順）'));
    fireEvent.change(screen.getByLabelText('カードの高さ（px）'), { target: { value: '300' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // 画面は選択肢ごとにある。別の画面でも、手元の古い値ではなく残した値を出す
    fireEvent.click(within(second.container).getByLabelText('lora_name（Loraを選ぶ）'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('大きさ・降順（押すと昇順）')).toBeDefined();
    // 三角を押すと、その種類をその向きで直接並べる
    fireEvent.click(within(dialog).getByLabelText('名前・昇順で並べる'));
    expect(within(dialog).getByLabelText('名前・昇順（押すと降順）')).toBeDefined();
    expect(within(dialog).getByLabelText('名前・昇順で並べる').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(within(dialog).getByLabelText<HTMLInputElement>('カードの高さ（px）').value).toBe('300');
  });

  it('一覧に無いものが混じれば通常の選択肢のまま', () => {
    seed(LORA_FOLDER, ['b.safetensors']);
    render(<WidgetControl row={loraRow()} onCommit={vi.fn()} />);

    expect(screen.getByLabelText('lora_name').tagName).toBe('SELECT');
  });

  it('一覧を取れていなければ通常の選択肢のまま', () => {
    render(<WidgetControl row={loraRow()} onCommit={vi.fn()} />);

    expect(screen.getByLabelText('lora_name').tagName).toBe('SELECT');
  });
});

describe('数値の欄', () => {
  const size = (): NodeRow =>
    row({
      name: 'width',
      label: 'width',
      type: 'INT',
      value: 1024,
      widgetName: 'width',
      multiline: false,
      number: { integer: true, step: 16, min: 16, max: 16384, round: null },
    });

  it('未入力のまま焦点を当てて離れても値を作らない（App 列）', () => {
    const onCommit = vi.fn();
    render(<WidgetControl row={size()} onCommit={onCommit} value="" placeholder="1024" />);
    const field = screen.getByLabelText<HTMLInputElement>('width');

    fireEvent.focus(field);
    fireEvent.blur(field);

    expect(onCommit).not.toHaveBeenCalled();
    expect(field.value).toBe('');
  });

  it('未入力の欄で押すと、送りの起点としてノードの値を入れ、送らずに離せば空へ戻す', () => {
    const onCommit = vi.fn();
    render(<WidgetControl row={size()} onCommit={onCommit} value="" placeholder="1000" />);
    const field = screen.getByLabelText<HTMLInputElement>('width');

    fireEvent.pointerDown(field);
    expect(field.value).toBe('1000');
    fireEvent.pointerUp(window);

    expect(field.value).toBe('');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('上下キーでも未入力ならノードの値を起点にする', () => {
    render(<WidgetControl row={size()} onCommit={vi.fn()} value="" placeholder="1000" />);
    const field = screen.getByLabelText<HTMLInputElement>('width');

    fireEvent.keyDown(field, { key: 'ArrowUp' });

    expect(field.value).toBe('1000');
  });

  it('値の入った欄では起点を入れ替えない', () => {
    render(<WidgetControl row={size()} onCommit={vi.fn()} value={2048} placeholder="1000" />);
    const field = screen.getByLabelText<HTMLInputElement>('width');

    fireEvent.pointerDown(field);

    expect(field.value).toBe('2048');
  });

  it('カードで空にして離れたら元の値に戻す', () => {
    const onCommit = vi.fn();
    render(<WidgetControl row={size()} onCommit={onCommit} />);
    const field = screen.getByLabelText<HTMLInputElement>('width');

    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);

    expect(onCommit).not.toHaveBeenCalled();
    expect(field.value).toBe('1024');
  });
});
describe('画像の選択肢', () => {
  const BASE = 'http://127.0.0.1:8188';

  function imageRow(): NodeRow {
    return nodeRow({
      name: 'image',
      label: 'image',
      type: 'COMBO',
      value: 'a.png',
      options: ['a.png', 'b.png'],
      target: { kind: 'node', nodeId: 1, classType: 'LoadImage' },
      widgetName: 'image',
      imageUpload: true,
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    useSettingsStore.setState({ baseUrl: '' });
  });

  it('欄から画像の選択を開き、カードを選んで決定すると値を書いて閉じる', async () => {
    useSettingsStore.setState({ baseUrl: BASE });
    const onCommit = vi.fn();
    render(<WidgetControl row={imageRow()} onCommit={onCommit} />);

    fireEvent.click(screen.getByLabelText('image（画像を選ぶ）'));
    const card = await screen.findByTitle('b.png');
    // 画像は入力フォルダから `/view` で引く（同時に読む数は順番待ちで抑える）
    await waitFor(() => expect(card.querySelector('img')?.getAttribute('src')).toContain('/view?'));

    fireEvent.click(card);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '画像を決定' }));

    expect(onCommit.mock.calls[0]?.[1]).toBe('b.png');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('選んだファイルをアップロードし、そのクラスの選択肢を取り直して名前で絞る', async () => {
    useSettingsStore.setState({ baseUrl: BASE });
    const reloadOptions = vi.fn(() => Promise.resolve());
    const original = useDefinitionsStore.getState().reloadOptions;
    useDefinitionsStore.setState({ reloadOptions });
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve(
        new Response(JSON.stringify({ name: 'c (1).png', subfolder: '', type: 'input' })),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onCommit = vi.fn();
    render(<WidgetControl row={imageRow()} onCommit={onCommit} />);

    fireEvent.click(screen.getByLabelText('image（画像を選ぶ）'));
    const dialog = await screen.findByRole('dialog');
    const input = dialog.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('ファイルの入力が無い');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'c.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(reloadOptions).toHaveBeenCalledWith(BASE, 'LoadImage'));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/upload/image`);
    // 名前が変わったことを知らせ、値は書かない（決定で書く）
    expect(await within(dialog).findByText(/c \(1\)\.png/)).toBeDefined();
    // 絞り込みは変えず、既存の画像も出したまま（上げた画像はそのカードまで送って見せる）
    expect(within(dialog).getByRole<HTMLInputElement>('searchbox').value).toBe('');
    expect(within(dialog).getByTitle('a.png')).toBeDefined();
    expect(within(dialog).getByTitle('b.png')).toBeDefined();
    expect(onCommit).not.toHaveBeenCalled();
    useDefinitionsStore.setState({ reloadOptions: original });
  });

  it('画像でないファイルは送らずに知らせる', async () => {
    useSettingsStore.setState({ baseUrl: BASE });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<WidgetControl row={imageRow()} onCommit={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('image（画像を選ぶ）'));
    const dialog = await screen.findByRole('dialog');
    const input = dialog.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('ファイルの入力が無い');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] },
    });

    expect(await within(dialog).findByText('アップロードできるのは画像だけです')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
