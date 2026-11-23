import { useQueueWatch } from '@/hooks/run/use-queue-watch';
import { useRepeatRunDriver } from '@/hooks/run/use-repeat-run';
import { useRunHistoryLoad } from '@/hooks/run/use-run-history-load';

export function ComfyBackground(): null {
  useQueueWatch();
  useRepeatRunDriver();
  useRunHistoryLoad();
  return null;
}
