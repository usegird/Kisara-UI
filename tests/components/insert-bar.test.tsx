// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { WildcardOverlay } from '@/components/comfy/dialogs/WildcardOverlay';
import { InsertBar } from '@/components/comfy/flow/InsertBar';
import { LORA_FOLDER } from '@/graph/model-files';
import { EMPTY_STYLE_TABLE } from '@/graph/styles';
import { TEXT_DRAG_TYPE } from '@/lib/text-drag-session';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDialogStore } from '@/store/use-dialog-store';
import { useGraphStore } from '@/store/use-graph-store';
import { EMPTY_MODEL_FOLDER, useModelFilesStore } from '@/store/use-model-files-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

import { stubMissingDom } from '../helpers/dom';
import { modelFile, modelFolder } from '../helpers/model-files';

// 一覧は取りに行かない（テストから ComfyUI に触れない）
vi.mock('@/comfy/models', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/models')>()),
  fetchModelFiles: () => Promise.reject(new Error('テストでは取らない')),
  // 学習で多かった語は取り終わらない（画像の読み込みで接続が埋まっている間の形）
  fetchModelMetadata: () => new Promise(() => undefined),
}));
vi.mock('@/comfy/wildcards', () => ({ fetchWildcards: () => Promise.resolve(null) }));

// ─────────────────────────────
// 差し込みのアイコン。3 つとも常に並べ、サーバーの事情で使えなければ斜線。
// どれもキャレットに拠らず開け、各画面の決定が差し込み先の条件を持つ。
// ─────────────────────────────

const BASE = 'http://127.0.0.1:1';
const NAMES = ['Lora を差し込む', 'スタイルを開く', 'ワイルドカードを差し込む'] as const;

beforeAll(stubMissingDom);

afterEach(() => {
  cleanup();
  useConnectionStore.setState({ status: 'disconnected' });
  useStylesStore.setState({ status: 'idle', table: EMPTY_STYLE_TABLE, editing: null });
  useWildcardsStore.setState({ status: 'idle', names: [], baseUrl: '', panelOpen: false });
  useModelFilesStore.setState({ folders: new Map() });
});

function icons(): HTMLButtonElement[] {
  return NAMES.map((name) => screen.getByRole<HTMLButtonElement>('button', { name }));
}

/** 3 つとも使える接続先につないだ状態 */
function ready(): void {
  useSettingsStore.setState({ baseUrl: BASE });
  useConnectionStore.setState({ status: 'connected' });
  useModelFilesStore.setState({
    folders: new Map([[LORA_FOLDER, { ...EMPTY_MODEL_FOLDER, status: 'ready' }]]),
  });
  useStylesStore.setState({
    status: 'ready',
    table: { ...EMPTY_STYLE_TABLE, styles: [{ name: 's', prompt: 'p', negative: '', other: {} }] },
  });
  useWildcardsStore.setState({ status: 'ready', names: ['__animal__'], baseUrl: BASE });
}

describe('差し込みのアイコン', () => {
  it('接続していなければ 3 つとも斜線を引いて押せない', () => {
    render(<InsertBar />);

    for (const icon of icons()) {
      expect(icon.disabled).toBe(true);
      expect(icon.title).toBe('接続していません');
    }
  });

  it('接続先が持たないものは斜線を引き、理由を指したときに出す', () => {
    ready();
    useModelFilesStore.setState({
      folders: new Map([[LORA_FOLDER, { ...EMPTY_MODEL_FOLDER, status: 'error' }]]),
    });
    useStylesStore.setState({ status: 'error' });
    useWildcardsStore.setState({ status: 'unavailable', names: [], baseUrl: BASE });
    render(<InsertBar />);

    const [lora, style, wildcard] = icons();
    expect(lora?.title).toContain('モデルの一覧');
    expect(style?.title).toContain('styles.csv');
    expect(wildcard?.title).toContain('Impact Pack');
  });

  it('使えるなら、キャレットの有無に拠らず 3 つとも押せる（条件は各画面の決定が持つ）', () => {
    ready();
    render(
      <>
        <input aria-label="1 行" />
        <InsertBar />
      </>,
    );

    screen.getByLabelText<HTMLInputElement>('1 行').focus();
    expect(icons().every((icon) => !icon.disabled)).toBe(true);
  });

  describe('Lora', () => {
    /** 学習の語を使わない書式にする（テストから metadata を取りに行かない） */
    function readyWithLoras(): void {
      ready();
      useSettingsStore.setState({ loraCopyFormat: '<lora:[loraname]:1>' });
      useModelFilesStore.setState({
        folders: new Map([[LORA_FOLDER, modelFolder([modelFile('b.safetensors')])]]),
      });
    }

    async function openLora(): Promise<HTMLElement> {
      fireEvent.click(screen.getByRole('button', { name: 'Lora を差し込む' }));
      return screen.findByRole('dialog');
    }

    it('開いている間にアイコンを押し直すと閉じる', async () => {
      readyWithLoras();
      render(<InsertBar />);
      await openLora();

      fireEvent.click(screen.getByRole('button', { name: 'Lora を差し込む' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('埋め込みで開いている間にワイルドカードを押すと、Lora の画面を閉じて切り替える', async () => {
      readyWithLoras();
      useSettingsStore.setState({ dialogLayouts: { 'lora-insert': { mode: 'embedded' } } });
      const host = document.createElement('div');
      document.body.append(host);
      act(() => useDialogStore.getState().setEmbedHost(host));
      render(
        <>
          <InsertBar />
          <WildcardOverlay />
        </>,
      );
      await openLora();

      fireEvent.click(screen.getByRole('button', { name: 'ワイルドカードを差し込む' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(useWildcardsStore.getState().panelOpen).toBe(true);
      useSettingsStore.setState({ dialogLayouts: {} });
      host.remove();
    });

    it('出し方と列の幅は、パラメータ行から開くものと分けて残す', async () => {
      readyWithLoras();
      render(<InsertBar />);
      const dialog = await openLora();
      // ディレクトリをピン止めすると、境目で幅を変えられる
      fireEvent.click(within(dialog).getByRole('button', { name: 'フォルダを出す' }));
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'フォルダをピン止めする（常に出す）' }),
      );
      expect(useSettingsStore.getState().dialogPanePins).toEqual({
        'lora-insert:directory': true,
      });

      fireEvent.keyDown(within(dialog).getByRole('separator', { name: 'ディレクトリの幅' }), {
        key: 'ArrowRight',
      });

      const widths = useSettingsStore.getState().dialogPaneWidths;
      expect(Object.keys(widths)).toEqual(['lora-insert:left']);
      useSettingsStore.setState({ dialogPaneWidths: {}, dialogPanePins: {} });
    });

    it('フォルダの切り替えは、一時的に出す → ピン止め → やめると巡る。一時的なものは選ぶか外で閉じる', async () => {
      readyWithLoras();
      render(<InsertBar />);
      const dialog = await openLora();
      const directoryList = (): HTMLElement | null =>
        within(dialog).queryByRole('navigation', { name: 'ディレクトリ' });
      expect(directoryList()).toBeNull();

      // 一時的に出す。ディレクトリを選ぶと閉じる
      fireEvent.click(within(dialog).getByRole('button', { name: 'フォルダを出す' }));
      const shown = directoryList();
      expect(shown).not.toBeNull();
      fireEvent.click(within(shown as HTMLElement).getAllByRole('button')[0] as HTMLElement);
      expect(directoryList()).toBeNull();

      // 一時的に出したものは、外（格子）を押しても閉じる
      fireEvent.click(within(dialog).getByRole('button', { name: 'フォルダを出す' }));
      fireEvent.pointerDown(within(dialog).getByTitle('b.safetensors'));
      expect(directoryList()).toBeNull();

      // ピン止めすると選んでも外を押しても残り、やめると隠れる
      fireEvent.click(within(dialog).getByRole('button', { name: 'フォルダを出す' }));
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'フォルダをピン止めする（常に出す）' }),
      );
      fireEvent.pointerDown(within(dialog).getByTitle('b.safetensors'));
      expect(directoryList()).not.toBeNull();
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'フォルダのピン止めをやめる（隠す）' }),
      );
      expect(directoryList()).toBeNull();
      // やめたことも残す（切り替えていないときの既定と分ける）
      expect(useSettingsStore.getState().dialogPanePins).toEqual({
        'lora-insert:directory': false,
      });
    });

    it('Esc は選んでいれば選択を外し、選んでいなければ閉じる', async () => {
      readyWithLoras();
      render(<InsertBar />);
      const dialog = await openLora();
      const card = within(dialog).getByTitle('b.safetensors');
      fireEvent.click(card, { detail: 1 });
      expect(card.getAttribute('aria-pressed')).toBe('true');

      fireEvent.keyDown(card, { key: 'Escape' });
      expect(card.getAttribute('aria-pressed')).toBe('false');
      expect(screen.queryByRole('dialog')).not.toBeNull();

      fireEvent.keyDown(card, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('焦点を閉じ込めず、差し込み先が無ければ決定を押せない', async () => {
      readyWithLoras();
      render(
        <>
          <textarea aria-label="複数行" />
          <InsertBar />
        </>,
      );
      const dialog = await openLora();
      fireEvent.click(within(dialog).getByTitle('b.safetensors'));

      const place = within(dialog).getByRole<HTMLButtonElement>('button', { name: /を決定する$/ });
      expect(place.disabled).toBe(true);
      expect(place.title).toBe('挿入先を選択してから選択するか、アイコンをドロップしてください');

      // 開いたまま外の欄に入れば、そこが差し込み先になる
      // 開いたまま外の欄を押せば（閉じない）、そこが差し込み先になる
      const field = screen.getByLabelText<HTMLTextAreaElement>('複数行');
      fireEvent.pointerDown(field);
      fireEvent.mouseDown(field);
      act(() => field.focus());
      fireEvent.click(field);
      await waitFor(() => expect(place.disabled).toBe(false));
      expect(screen.queryByRole('dialog')).not.toBeNull();
    });

    it('差し込み先が無ければ見出しに理由と帯にアイコンを出し、アイコンを欄へ落とすと差し込み先になる', async () => {
      readyWithLoras();
      render(
        <>
          <textarea aria-label="複数行" defaultValue="ab" />
          <InsertBar />
        </>,
      );
      const dialog = await openLora();
      const reason = '挿入先を選択してから選択するか、アイコンをドロップしてください';
      expect(within(dialog).getByText(reason)).toBeTruthy();
      const handle = within(dialog).getByTitle('複数行の入力欄へ落とすと、そこを挿入先にします');
      fireEvent.dragStart(handle, { dataTransfer: { setData: () => undefined } });

      const field = screen.getByLabelText<HTMLTextAreaElement>('複数行');
      for (const type of ['dragover', 'drop'] as const) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', {
          value: { types: [TEXT_DRAG_TYPE], dropEffect: 'none' },
        });
        act(() => {
          field.dispatchEvent(event);
        });
      }

      // 文字は入れず、落とした欄が差し込み先になる（理由と帯のアイコンが消え、欄に印が付く）
      await waitFor(() => expect(within(dialog).queryByText(reason)).toBeNull());
      expect(field.value).toBe('ab');
      expect(within(dialog).queryByTitle(/^複数行の入力欄へ落とすと/)).toBeNull();
      expect(screen.getByTitle('挿入位置（掴んでほかの位置・欄へ動かせます）')).toBeTruthy();
    });

    it('挿入位置のアイコンは開いている間だけ出す', async () => {
      const { dialog } = await openWithField();
      const marker = '挿入位置（掴んでほかの位置・欄へ動かせます）';
      expect(screen.getByTitle(marker)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Loraを選ぶ画面を閉じる' }));
      await waitFor(() => expect(screen.queryByTitle(marker)).toBeNull());
    });

    /** 差し込み先の欄にキャレットを置いてから開き、b を選ぶ */
    async function openWithField(): Promise<{ field: HTMLTextAreaElement; dialog: HTMLElement }> {
      readyWithLoras();
      render(
        <>
          <textarea aria-label="複数行" defaultValue="" />
          <InsertBar />
        </>,
      );
      const field = screen.getByLabelText<HTMLTextAreaElement>('複数行');
      field.focus();
      const dialog = await openLora();
      fireEvent.click(within(dialog).getByTitle('b.safetensors'));
      return { field, dialog };
    }

    it('情報の名前の左の取り込みは差し込み先へ入れ、ダイアログも情報も閉じない', async () => {
      const { field, dialog } = await openWithField();
      const info = await within(dialog).findByLabelText('モデルの情報');
      const insert = within(info).getByRole('button', { name: /を閉じずにキャレットの位置へ/ });
      expect(insert.nextElementSibling?.tagName).toBe('H3');
      fireEvent.click(insert);

      await waitFor(() => expect(field.value).toContain('<lora:'));
      expect(screen.queryByRole('dialog')).not.toBeNull();
      expect(within(dialog).queryByLabelText('モデルの情報')).not.toBeNull();

      // 操作の帯の左のまとまりの右端の × でも閉じる
      fireEvent.click(within(dialog).getByRole('button', { name: 'Loraを選ぶ画面を閉じる' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('決定は差し込み先へ入れ、閉じずに続けて選べる', async () => {
      const { field, dialog } = await openWithField();
      fireEvent.click(within(dialog).getByRole('button', { name: /を決定する$/ }));

      await waitFor(() => expect(field.value).toContain('<lora:'));
      expect(screen.queryByRole('dialog')).not.toBeNull();
      // 末尾に改行を足し、キャレットは入れた文字の先頭に戻す
      expect(field.value.endsWith('\n')).toBe(true);
      expect(field.selectionStart).toBe(0);
    });

    it('カードのダブルクリックも入れて閉じない', async () => {
      const { field, dialog } = await openWithField();
      fireEvent.doubleClick(within(dialog).getByTitle('b.safetensors'));

      await waitFor(() => expect(field.value).toContain('<lora:'));
      expect(screen.queryByRole('dialog')).not.toBeNull();
    });

    it('選んでいるカードの Enter は決定と同じ。選んでいなければ決めない', async () => {
      const { field, dialog } = await openWithField();
      const card = within(dialog).getByTitle('b.safetensors');
      fireEvent.click(card, { detail: 1 });
      expect(card.getAttribute('aria-pressed')).toBe('false');
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(screen.queryByRole('dialog')).not.toBeNull();

      fireEvent.click(card, { detail: 1 });
      fireEvent.keyDown(card, { key: 'Enter' });
      await waitFor(() => expect(field.value).toContain('<lora:'));
      expect(screen.queryByRole('dialog')).not.toBeNull();
    });

    it('情報は少し待って格子に重ねて出す', async () => {
      readyWithLoras();
      render(
        <>
          <textarea aria-label="複数行" defaultValue="" />
          <InsertBar />
        </>,
      );
      screen.getByLabelText<HTMLTextAreaElement>('複数行').focus();
      const dialog = await openLora();
      const card = within(dialog).getByTitle('b.safetensors');
      fireEvent.click(card);

      // 押してすぐには出さない（ダブルクリックの 1 回目で出さない）
      expect(within(dialog).queryByLabelText('モデルの情報')).toBeNull();
      // 格子と同じ囲みの中に重ねる（横に並べて格子の幅を削らない）
      const info = await within(dialog).findByLabelText('モデルの情報');
      const grid = card.closest('.overflow-y-auto');
      expect(grid?.parentElement?.contains(info)).toBe(true);
      expect(grid?.contains(info)).toBe(false);
    });

    it('ダブルクリック（押す 2 回とダブルクリック）では情報を出さない', async () => {
      const { dialog } = await openWithField();
      // 開いた直後の選択を外してから、外したカードをダブルクリックする
      const card = within(dialog).getByTitle('b.safetensors');
      fireEvent.click(card, { detail: 1 });
      fireEvent.click(card, { detail: 1 });
      fireEvent.click(card, { detail: 2 });
      fireEvent.doubleClick(card);
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(screen.queryByLabelText('モデルの情報')).toBeNull();
    });

    it('格子と情報の外を押すと情報だけ隠す（選んだまま）', async () => {
      readyWithLoras();
      render(<InsertBar />);
      const dialog = await openLora();
      const card = within(dialog).getByTitle('b.safetensors');
      fireEvent.click(card, { detail: 1 });
      const info = await within(dialog).findByLabelText('モデルの情報');

      fireEvent.pointerDown(within(info).getByText('パス'));
      expect(within(dialog).queryByLabelText('モデルの情報')).not.toBeNull();

      fireEvent.pointerDown(within(dialog).getByLabelText('大きさで並べる'));
      expect(within(dialog).queryByLabelText('モデルの情報')).toBeNull();
      expect(card.getAttribute('aria-pressed')).toBe('true');
    });

    it('情報を右に置いたときは、置き場の切り替えを見出しでなく右下に浮かせる', async () => {
      readyWithLoras();
      render(<InsertBar />);
      const dialog = await openLora();
      fireEvent.click(within(dialog).getByTitle('b.safetensors'), { detail: 1 });
      const info = await within(dialog).findByLabelText('モデルの情報');

      const toggle = within(dialog).getByRole('button', { name: '情報を下に出す' });
      expect(info.contains(toggle)).toBe(false);
      expect(toggle.className).toContain('bottom-3');

      fireEvent.click(toggle);
      const moved = within(dialog).getByRole('button', { name: '情報を右に出す' });
      expect(within(dialog).getByLabelText('モデルの情報').contains(moved)).toBe(true);
      useSettingsStore.setState({ dialogPaneDocks: {} });
    });

    it('情報を出している間にほかのカードを押すと、すぐそちらの情報に切り替える', async () => {
      readyWithLoras();
      useModelFilesStore.setState({
        folders: new Map([
          [LORA_FOLDER, modelFolder([modelFile('b.safetensors'), modelFile('c.safetensors')])],
        ]),
      });
      render(<InsertBar />);
      const dialog = await openLora();
      fireEvent.click(within(dialog).getByTitle('b.safetensors'), { detail: 1 });
      const info = await within(dialog).findByLabelText('モデルの情報');
      expect(info.textContent).toContain('b.safetensors');

      fireEvent.click(within(dialog).getByTitle('c.safetensors'), { detail: 1 });
      await waitFor(() =>
        expect(within(dialog).getByLabelText('モデルの情報').textContent).toContain(
          'c.safetensors',
        ),
      );
      expect(within(dialog).getByTitle('b.safetensors').getAttribute('aria-pressed')).toBe('false');
    });

    it('カードの外か、選んでいるカードを押すと選択を外し、情報を消す', async () => {
      readyWithLoras();
      render(<InsertBar />);
      const dialog = await openLora();
      const card = within(dialog).getByTitle('b.safetensors');
      fireEvent.click(card);
      await within(dialog).findByLabelText('モデルの情報');

      fireEvent.click(card.closest('.overflow-y-auto') as HTMLElement);

      expect(within(dialog).queryByLabelText('モデルの情報')).toBeNull();
      expect(card.getAttribute('aria-pressed')).toBe('false');

      // 選んでいるカードを押し直す
      fireEvent.click(card, { detail: 1 });
      await within(dialog).findByLabelText('モデルの情報');
      fireEvent.click(card, { detail: 1 });
      expect(within(dialog).queryByLabelText('モデルの情報')).toBeNull();
      expect(card.getAttribute('aria-pressed')).toBe('false');
    });

    it('押した所に情報が被るときだけ待つ（置き場は問わない）。下なら格子の末尾を伸ばす', async () => {
      readyWithLoras();
      useSettingsStore.setState({
        dialogPaneDocks: { 'lora-insert:info': 'bottom' },
        dialogPaneWidths: { 'lora-insert:info:bottom': 200 },
        dialogPanePins: { 'lora-insert:directory': true },
      });
      // 格子の囲みは 1000×1000。下の情報（200 + 境目 1）が覆うのは y >= 799
      const rect = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockReturnValue(new DOMRect(0, 0, 1000, 1000));
      render(<InsertBar />);
      const dialog = await openLora();
      const card = within(dialog).getByTitle('b.safetensors');
      const grid = card.closest<HTMLElement>('.overflow-y-auto');
      expect(grid?.style.paddingBottom).toBe('');

      // 被らない所を押したら待たずに出す
      fireEvent.click(card, { detail: 1, clientX: 100, clientY: 100 });
      expect(within(dialog).getByLabelText('モデルの情報')).toBeDefined();
      // 情報の高さ + 境目の線 + 格子の余白
      expect(grid?.style.paddingBottom).toBe('213px');
      // 下の情報は格子の外（左のディレクトリの列の上）まで全幅に重ねる。押しても隠れない
      const info = within(dialog).getByLabelText('モデルの情報');
      const directory = within(dialog).getByRole('navigation', { name: 'ディレクトリ' });
      expect(grid?.parentElement?.contains(info)).toBe(false);
      expect(info.closest('.relative')?.contains(directory)).toBe(true);
      fireEvent.pointerDown(info);
      expect(within(dialog).getByLabelText('モデルの情報')).toBeDefined();

      // 被る所を押したら待つ
      fireEvent.click(card, { detail: 1 });
      fireEvent.click(card, { detail: 1, clientX: 100, clientY: 900 });
      expect(within(dialog).queryByLabelText('モデルの情報')).toBeNull();
      expect(await within(dialog).findByLabelText('モデルの情報')).toBeDefined();

      rect.mockRestore();
      useSettingsStore.setState({ dialogPaneDocks: {}, dialogPaneWidths: {}, dialogPanePins: {} });
    });

    it('カードを掴むと、設定の書式の文字をブラウザのドラッグに載せる', async () => {
      readyWithLoras();
      render(<InsertBar />);
      const dialog = await openLora();
      const card = within(dialog).getByTitle('b.safetensors').closest('[draggable="true"]');
      const setData = vi.fn();

      expect(card).not.toBeNull();
      fireEvent.pointerDown(card as Element);
      fireEvent.dragStart(card as Element, { dataTransfer: { setData, effectAllowed: '' } });

      expect(setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('<lora:'));
    });

    it('学習で多かった語を取り終える前でも掴める（入れる文字は落とした時に作る）', async () => {
      readyWithLoras();
      useSettingsStore.setState({ loraCopyFormat: '<lora:[loraname]:1> [learntext]' });
      render(<InsertBar />);
      const dialog = await openLora();
      const card = within(dialog).getByTitle('b.safetensors').closest('[draggable="true"]');
      const setData = vi.fn();

      fireEvent.pointerDown(card as Element);
      const started = fireEvent.dragStart(card as Element, {
        dataTransfer: { setData, effectAllowed: '' },
      });

      // 掴むのを止めない。落とし先が受け持つ目印だけ載せ、文字は載せない
      expect(started).toBe(true);
      expect(setData).toHaveBeenCalledWith(TEXT_DRAG_TYPE, '');
      expect(setData).not.toHaveBeenCalledWith('text/plain', expect.anything());
    });
  });

  it('スタイルのアイコンは既存の編集の画面を開く', async () => {
    ready();
    render(
      <>
        <textarea aria-label="複数行" />
        <InsertBar />
      </>,
    );
    screen.getByLabelText<HTMLTextAreaElement>('複数行').focus();
    const style = screen.getByRole<HTMLButtonElement>('button', { name: 'スタイルを開く' });
    await waitFor(() => expect(style.disabled).toBe(false));

    fireEvent.click(style);
    expect(useStylesStore.getState().editing).toEqual({ name: 's' });
  });

  it('ワイルドカードのアイコンは重ねる一覧を開き、押し直すと閉じる', async () => {
    ready();
    render(
      <>
        <textarea aria-label="複数行" />
        <InsertBar />
      </>,
    );
    screen.getByLabelText<HTMLTextAreaElement>('複数行').focus();
    const icon = screen.getByRole<HTMLButtonElement>('button', {
      name: 'ワイルドカードを差し込む',
    });
    await waitFor(() => expect(icon.disabled).toBe(false));

    fireEvent.click(icon);
    expect(useWildcardsStore.getState().panelOpen).toBe(true);
    // 開いている間に押し直すと閉じる
    fireEvent.click(icon);
    expect(useWildcardsStore.getState().panelOpen).toBe(false);
  });

  it('スタイルの編集中もワイルドカードを押せる（入れ替えはダイアログの枠が持つ）', () => {
    ready();
    render(<InsertBar />);
    act(() => useStylesStore.setState({ editing: { name: 's' } }));
    const icon = screen.getByRole<HTMLButtonElement>('button', {
      name: 'ワイルドカードを差し込む',
    });
    expect(icon.disabled).toBe(false);

    fireEvent.click(icon);
    expect(useWildcardsStore.getState().panelOpen).toBe(true);
  });

  it('スタイルのアイコンは開いている間に押し直すと、画面に閉じるよう頼む', () => {
    ready();
    render(<InsertBar />);
    const icon = screen.getByRole('button', { name: 'スタイルを開く' });

    fireEvent.click(icon);
    expect(useStylesStore.getState().editing).not.toBeNull();
    fireEvent.click(icon);

    // 直しかけの確認は画面が持つので、ここでは頼むだけ
    expect(useStylesStore.getState().closeRequested).toBe(true);
    act(() => useStylesStore.getState().closeEditor());
  });

  it('LLM からの呼び出し設定は、直しかけがあるまま押し直すと確かめ、無ければそのまま閉じる', async () => {
    // 前のテストが残した埋め込み先には出さない（画面の外になる）
    useDialogStore.setState({ embedHost: null, order: [] });
    useGraphStore.setState({
      workflow: { nodes: [], links: [], extra: { ds: { scale: 1 } } },
    });
    render(<InsertBar />);
    const icon = screen.getByRole('button', { name: 'LLM からの呼び出し設定' });
    // ダイアログは遅れて読み込む部品。先に読んでおき、開いたときの読み込みを待たない
    await import('@/components/comfy/flow/dialogs/WorkflowToolDialog');
    const name = async (): Promise<HTMLElement> => screen.findByRole('textbox', { name: /機能名/ });

    fireEvent.click(icon);
    await name();
    fireEvent.click(icon);
    expect(icon.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(icon);
    fireEvent.change(await name(), { target: { value: 'make_image' } });
    fireEvent.click(icon);
    expect(screen.getByText('変更は保存されていませんが閉じても良いですか？')).toBeTruthy();
    expect(icon.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(icon.getAttribute('aria-expanded')).toBe('false');
    useGraphStore.setState({ workflow: null });
  });
});
