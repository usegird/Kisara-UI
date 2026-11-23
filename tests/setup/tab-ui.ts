import { afterEach } from 'vitest';

import { useTabUiStore } from '@/store/use-tab-ui-store';

afterEach(() => {
  useTabUiStore.setState({ values: {} });
});
