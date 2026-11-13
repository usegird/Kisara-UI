import { toSlashPath } from '@/lib/file-name';
import { matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';

// ─────────────────────────────
// 画像を読み込む選択肢の加工（判定・並べ替え・絞り込み・値の書き方）。純関数だけを置く。
// ─────────────────────────────

/**
 * 入力設定から、画像を読み込む選択肢かを決める（widget の数え方と同じ判定）。
 * ノード名ではなく入力設定の `image_upload` で決める（接続先のノード構成に依存しないため）。
 * 動画・音声のアップロード（別の設定）は含めない。
 */
export function isImageUpload(config: Readonly<Record<string, unknown>>): boolean {
  const value = config.image_upload;
  return value !== undefined && value !== null && value !== false;
}

/** 画像の選択肢 1 つを、絞り込みとカードの表示に使う形にしたもの */
export interface ImageItem {
  /** 選択肢の文字列そのもの（返す値） */
  readonly value: string;
  /** 区切りを `/` に揃えた名前（絞り込みに使う） */
  readonly path: string;
  /** サブフォルダを除いた名前（カードに出す） */
  readonly label: string;
}

/** 選択肢を並びの元にする。文字列でない・空の選択肢は落とす */
export function buildImageItems(options: readonly unknown[]): ImageItem[] {
  const items: ImageItem[] = [];

  for (const option of options) {
    if (typeof option !== 'string' || option.length === 0) continue;

    const path = toSlashPath(option);
    items.push({ value: option, path, label: path.split('/').pop() ?? path });
  }
  return items;
}

/** 名前の順（選択肢は名前しか持たないので、並び替えは向きだけ） */
export function sortImageItems(items: readonly ImageItem[], ascending: boolean): ImageItem[] {
  const direction = ascending ? 1 : -1;
  return [...items].sort((left, right) => left.path.localeCompare(right.path) * direction);
}

/**
 * 絞り込みと並べ直し。サブフォルダを含む名前の部分一致。
 * 入力が空なら渡した順のまま。同じ順位どうしも渡した順を保つ
 */
export function filterImageItems(items: readonly ImageItem[], query: string): ImageItem[] {
  const terms = searchTerms(query);
  const matched = items.filter((item) => matchesAnyTerm(item.path, terms));
  return rankBySearch(matched, query, (item) => ({
    names: [item.label, item.path],
    texts: [item.path],
  }));
}

/** 置き場の中のファイル（実行の出力・置いた画像。`/view` と同じ指し方） */
interface ImageFile {
  readonly filename: string;
  readonly subfolder: string;
  /** 置き場（`input` / `output` / `temp`） */
  readonly type: string;
}

/** ファイルを、画像を読み込む選択肢の値にする（本体の書き方。入力フォルダなら印を付けない） */
export function imageFileValue(file: ImageFile): string {
  const name = file.subfolder.length === 0 ? file.filename : `${file.subfolder}/${file.filename}`;
  return file.type === 'input' ? name : `${name} [${file.type}]`;
}
