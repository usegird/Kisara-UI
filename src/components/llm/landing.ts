import { Bot, Cloud } from 'lucide-react';

import type { LandingKind } from '@/components/ui/landing-kind';
import { t } from '@/i18n';

export function llmLanding(): LandingKind {
  return {
    key: 'llm',
    title: t('llm.landing.title'),
    summary: t('llm.landing.summary'),
    start: t('llm.landing.start'),
    routes: [
      {
        key: 'llm-local',
        name: t('llm.landing.localName'),
        via: t('llm.landing.localVia'),
        icon: Bot,
        place: 'local',
      },
      {
        key: 'llm-cloud',
        name: t('llm.landing.cloudName'),
        via: t('llm.landing.cloudVia'),
        detail: t('llm.landing.cloudDetail'),
        icon: Cloud,
        place: 'cloud',
      },
    ],
    notesHeading: t('llm.landing.title'),
    notes: [
      t('llm.landing.noteCors'),
      t('llm.landing.noteCorsScope'),
      t('llm.landing.noteListen'),
      t('llm.landing.noteSend'),
      t('llm.landing.noteCost'),
      t('llm.landing.noteKey'),
    ],
  };
}
