import type { LucideIcon } from 'lucide-react';

export interface LandingRoute {
  readonly key: string;
  readonly name: string;
  readonly via: string;
  readonly detail?: string;
  readonly icon: LucideIcon;
  readonly place: 'local' | 'cloud';
}

export interface LandingKind {
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly start: string;
  readonly routes: readonly LandingRoute[];
  readonly notesHeading: string;
  readonly notes: readonly string[];
}
