import { styleKey } from '@/graph/styles';
import { escapeFileName, unescapeFileName } from '@/lib/file-name';

// ─────────────────────────────
// KisaraUI が接続先のユーザーフォルダ（`kisara/` の下）に書くファイルの置き場と名前。
// 名前は要素ごとに退避してから経路にする。
// ─────────────────────────────

/** モデルのメモの置き場（ユーザーフォルダからの相対） */
export const KISARA_NOTES_DIR = 'kisara/notes';

/** スタイル 1 件ずつの置き場（同上） */
export const KISARA_STYLES_DIR = 'kisara/styles';

/**
 * タグ辞書と pysssss の上書きの置き場（同上）
 */
export const KISARA_TAGS_DIR = 'kisara/tags';

/**
 * pysssss の上書きのファイル（`kisara/tags` からの経路）。辞書と同じ形の CSV だが、辞書は直下の
 * `.csv` だけなのでフォルダに分けて重ならないようにする
 */
export const PYSSSSS_OVERRIDE_FILE = 'override/pysssss.csv';

/** 辞書のファイルの拡張子 */
const TAG_DICTIONARY_EXTENSION = '.csv';

/**
 * モデルのメモの、`kisara/notes` からの経路。モデル名の `/` `\` はフォルダの区切りとして残す。
 * 拡張子は残したまま `.txt` を足す（拡張子だけ違う同名のモデルを分ける）
 */
export function notesFilePath(folder: string, filename: string): string {
  const segments = [folder, ...filename.split(/[\\/]/)]
    .filter((segment) => segment.length > 0)
    .map(escapeFileName);
  return `${segments.join('/')}.txt`;
}

/** スタイル 1 件の、`kisara/styles` からの経路。名前は小文字にしてから退避する */
export function styleFilePath(name: string): string {
  return `${escapeFileName(styleKey(name))}.json`;
}

/** タグ辞書の、`kisara/tags` からの経路。名前の大小は保つ（重なりは名前を比べて防ぐ） */
export function tagDictionaryPath(name: string): string {
  return `${escapeFileName(name.trim())}${TAG_DICTIONARY_EXTENSION}`;
}

/** 一覧の経路から辞書の名前を戻す。辞書でない（直下の `.csv` でない）なら null */
export function tagDictionaryNameOf(path: string): string | null {
  if (path.includes('/') || !path.toLowerCase().endsWith(TAG_DICTIONARY_EXTENSION)) return null;
  const name = unescapeFileName(path.slice(0, -TAG_DICTIONARY_EXTENSION.length));
  return name.length > 0 ? name : null;
}
