import { fetchJson, type RequestOptions } from '@/comfy/client';
import { objectInfoClassUrl, objectInfoUrl } from '@/comfy/endpoints';
import { buildNodeDefinition, buildNodeDefinitionsInSlices } from '@/graph/node-definition';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import { isRecord } from '@/lib/guards';
import { yieldToMain } from '@/lib/yield-to-main';

// ─────────────────────────────
// ノード定義を取得し、選択肢を落とした形に射影する。
// ─────────────────────────────

/**
 * 全ノード定義を取得して射影する。`/object_info` は 20 MB 近くあり、大半は COMBO の選択肢
 * （モデルファイル一覧）が占めるので、取得したら**即座に射影して生レスポンスを捨てる**
 * （戻り値に含めない）。射影は小分けにし、合間にブラウザへ処理を返す（画面を止めない）
 */
export async function fetchNodeDefinitions(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<NodeDefinitionMap> {
  const raw = await fetchJson(objectInfoUrl(baseUrl), options);
  return buildNodeDefinitionsInSlices(raw, yieldToMain);
}

/**
 * 単一クラスの定義を取得する（数 KB）。全体の射影では落としている
 * COMBO の選択肢を含むので、ノード配置時の遅延取得に使う。
 */
export async function fetchNodeDefinition(
  baseUrl: string,
  className: string,
  options: RequestOptions = {},
): Promise<NodeDefinition | null> {
  const raw = await fetchJson(objectInfoClassUrl(baseUrl, className), options);
  if (!isRecord(raw)) return null;

  return buildNodeDefinition(className, raw[className]);
}
