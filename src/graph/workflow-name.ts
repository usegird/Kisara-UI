import { plainFileName } from '@/lib/file-name';

// ─────────────────────────────
// ワークフロー名の整形（表示名・保存名・保存先）。Workflow JSON に名前は入っておらず、ComfyUI 側でも
// 名前＝`workflows/` 配下のファイル名なので、同じ扱いにする。
// ─────────────────────────────

/** 拡張子とフォルダを落とした表示名 */
export function workflowDisplayName(path: string): string {
  const file = path.split('/').at(-1) ?? path;

  return file.replace(/\.json$/i, '');
}

/**
 * 保存名を `<name>.json` に整える。ComfyUI の一覧で読める名前のまま置くため、退避の符号にはせず
 * `plainFileName` の決まりで整える
 */
export function workflowFileName(name: string): string {
  return plainFileName(name, 'json', 'workflow');
}

/** 保存先の決まり方。`overwrite` が真なら**確かめずに**書いてよい */
export interface SaveTarget {
  readonly path: string;
  readonly overwrite: boolean;
}

/**
 * 上書き保存の行き先。**開いた元（最後に保存した先）と同じフォルダ**へ、今の名前で書く。
 * **名前が変わっていなければ開いた元そのもの**へ、確かめずに書く。保存名を作り直さないので、
 * 整える前の文字（接続先の OS で置けた `:` など）を含む元へも別名にならずに書ける。
 * 名前が変わっていれば別のファイルなので、同名があったら確かめる。保存先が無ければ `workflows/` 直下。
 */
export function saveTarget(savedPath: string | null, name: string): SaveTarget {
  if (savedPath !== null && workflowDisplayName(savedPath) === name.trim()) {
    return { path: savedPath, overwrite: true };
  }
  const file = workflowFileName(name);
  if (savedPath === null) return { path: file, overwrite: false };

  const slash = savedPath.lastIndexOf('/');
  const path = slash < 0 ? file : `${savedPath.slice(0, slash + 1)}${file}`;

  return { path, overwrite: path === savedPath };
}
