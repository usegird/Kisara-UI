import { Workflow } from 'lucide-react';

import { comfySecurityNotes } from '@/components/comfy/dialogs/security-notes';
import type { LandingKind } from '@/components/ui/landing-kind';
import { t } from '@/i18n';

// ─────────────────────────────
// ComfyUI の札・経路・セキュリティの注意。外枠は中身を知らないので、この層が文言を組んで渡す。
// 注意の中身は「ComfyUI に接続する」のポップアップと共用（`dialogs/security-notes.ts`）。
// ─────────────────────────────

/** 新しいタブの頁に出す ComfyUI の札（見出し・経路・注意）を組む */
export function comfyLanding(): LandingKind {
  return {
    key: 'comfy',
    title: t('comfy.landing.title'),
    summary: t('comfy.landing.summary'),
    start: t('comfy.landing.start'),
    routes: [
      {
        key: 'comfy',
        name: t('comfy.landing.routeName'),
        via: t('comfy.landing.routeVia'),
        icon: Workflow,
        place: 'local',
      },
    ],
    notesHeading: t('comfy.landing.title'),
    notes: comfySecurityNotes(),
  };
}
