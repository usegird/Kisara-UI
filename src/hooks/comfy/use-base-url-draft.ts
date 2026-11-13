import { useState } from 'react';

import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 接続先の欄の打ちかけの値。ほかの欄でつなぎ直して接続先が変わったら、打ちかけを捨てて揃える。
// ─────────────────────────────

/**
 * 接続先の欄の打ちかけの値と、その書き換えを返す。
 *
 * 接続先にするのはつないだとき（`useComfyConnect` の `connect(打ちかけの値)`）だけ。打つたびに接続先を
 * 変えると、つながっている通知や取得が確かめていない URL へ向き直り、不正な形なら組み立てで投げて
 * 画面ごと止まる。
 */
export function useBaseUrlDraft(): readonly [string, (value: string) => void] {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const [draft, setDraft] = useState(baseUrl);
  // 描画の中で揃える（effect で揃えると、古い値で 1 回描いてからもう 1 回描く）
  const [seen, setSeen] = useState(baseUrl);
  if (seen !== baseUrl) {
    setSeen(baseUrl);
    setDraft(baseUrl);
  }
  return [draft, setDraft];
}
