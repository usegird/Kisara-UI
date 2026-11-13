import { afterEach } from 'vitest';

import { useTabUiStore } from '@/store/use-tab-ui-store';

// ダイアログの開け閉ては部品の外（タブごとの状態）に持ち、描き直しても残るので、
// テストごとに閉じた状態へ戻す
afterEach(() => {
  useTabUiStore.setState({ values: {} });
});
