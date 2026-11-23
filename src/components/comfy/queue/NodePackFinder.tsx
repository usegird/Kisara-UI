import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { smallButton } from '@/components/ui/small-button';
import type { NodePackCandidate } from '@/graph/node-packs';
import { useNodePackFinder } from '@/hooks/run/use-node-pack-finder';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useNodePacksStore, type PackInstall } from '@/store/use-node-packs-store';

type Pending =
  { readonly kind: 'install'; readonly pack: NodePackCandidate } | { readonly kind: 'restart' };

export function NodePackFinder(): React.ReactElement | null {
  const finder = useNodePackFinder();
  const lookup = useNodePacksStore((state) => state.lookup);
  const [pending, setPending] = useState<Pending | null>(null);

  if (finder.missing.length === 0 && lookup === 'idle') return null;

  const onConfirm = (): void => {
    if (pending?.kind === 'install') finder.install(pending.pack);
    if (pending?.kind === 'restart') finder.restart();
    setPending(null);
  };

  return (
    <section className="border-input flex flex-col gap-1.5 rounded-md border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {t('run.report.manager.title', { count: String(finder.missing.length) })}
        </span>
        <button
          type="button"
          className={smallButton({ fade: true })}
          disabled={lookup === 'loading' || finder.missing.length === 0}
          onClick={guardPress('node-packs-find', finder.find)}
        >
          {lookup === 'loading' ? t('run.report.manager.finding') : t('run.report.manager.find')}
        </button>
      </div>
      <LookupResult
        onInstall={(pack) => setPending({ kind: 'install', pack })}
        onRestart={() => setPending({ kind: 'restart' })}
        onRefresh={finder.refreshDefinitions}
      />
      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'install'
            ? t('run.report.manager.confirmInstallTitle')
            : t('run.report.manager.confirmRestartTitle')
        }
        description={
          pending?.kind === 'install'
            ? t('run.report.manager.confirmInstall', { title: pending.pack.title })
            : t('run.report.manager.confirmRestart')
        }
        confirmLabel={
          pending?.kind === 'install'
            ? t('run.report.manager.install')
            : t('run.report.manager.restart')
        }
        onConfirm={onConfirm}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}

interface LookupResultProps {
  readonly onInstall: (pack: NodePackCandidate) => void;
  readonly onRestart: () => void;
  readonly onRefresh: () => void;
}

function LookupResult({ onInstall, onRestart, onRefresh }: LookupResultProps): React.ReactNode {
  const lookup = useNodePacksStore((state) => state.lookup);
  const version = useNodePacksStore((state) => state.version);
  const packs = useNodePacksStore((state) => state.packs);
  const unresolved = useNodePacksStore((state) => state.unresolved);
  const lookupError = useNodePacksStore((state) => state.lookupError);
  const installs = useNodePacksStore((state) => state.installs);

  if (lookup === 'no-manager') {
    return <p className="text-muted-foreground">{t('run.report.manager.noManager')}</p>;
  }
  if (lookup === 'error') {
    return (
      <p className="text-destructive">
        {t('run.report.manager.failed', { reason: lookupError ?? '' })}
      </p>
    );
  }
  if (lookup !== 'ready') return null;

  const anyInstalled = Object.values(installs).some((entry) => entry.status === 'installed');
  return (
    <>
      {version === null ? null : (
        <p className="text-muted-foreground">{t('run.report.manager.version', { version })}</p>
      )}
      <ul className="flex flex-col gap-1.5">
        {packs.map((pack) => (
          <PackRow
            key={pack.key}
            pack={pack}
            install={Object.hasOwn(installs, pack.key) ? (installs[pack.key] ?? null) : null}
            onInstall={onInstall}
          />
        ))}
      </ul>
      {unresolved.length === 0 ? null : (
        <p className="text-muted-foreground">
          {t('run.report.manager.unresolved', { nodes: unresolved.join(', ') })}
        </p>
      )}
      {anyInstalled ? <RestartRow onRestart={onRestart} onRefresh={onRefresh} /> : null}
    </>
  );
}

interface PackRowProps {
  readonly pack: NodePackCandidate;
  readonly install: PackInstall | null;
  readonly onInstall: (pack: NodePackCandidate) => void;
}

function PackRow({ pack, install, onInstall }: PackRowProps): React.ReactElement {
  const busy = install?.status === 'installing' || install?.status === 'installed';
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-medium" title={pack.key}>
          {pack.title}
        </span>
        <button
          type="button"
          className={smallButton({ fade: true })}
          disabled={busy}
          onClick={() => onInstall(pack)}
        >
          {t('run.report.manager.install')}
        </button>
      </div>
      <span className="text-muted-foreground break-words">
        {t('run.report.manager.packNodes', { nodes: pack.nodes.join(', ') })}
      </span>
      <InstallStatus install={install} />
    </li>
  );
}

function InstallStatus({ install }: { readonly install: PackInstall | null }): React.ReactNode {
  if (install === null) return null;
  if (install.status === 'installing') {
    return <span role="status">{t('run.report.manager.installing')}</span>;
  }
  if (install.status === 'installed') {
    return <span role="status">{t('run.report.manager.installed')}</span>;
  }
  return (
    <span role="status" className="text-destructive break-words">
      {t('run.report.manager.installFailed', { reason: install.message })}
    </span>
  );
}

interface RestartRowProps {
  readonly onRestart: () => void;
  readonly onRefresh: () => void;
}

function RestartRow({ onRestart, onRefresh }: RestartRowProps): React.ReactElement {
  const reboot = useNodePacksStore((state) => state.reboot);
  const rebootError = useNodePacksStore((state) => state.rebootError);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={smallButton({ fade: true })}
          disabled={reboot === 'rebooting'}
          onClick={onRestart}
        >
          {reboot === 'rebooting'
            ? t('run.report.manager.restarting')
            : t('run.report.manager.restart')}
        </button>
        <button
          type="button"
          className={smallButton()}
          onClick={guardPress('definitions-refresh', onRefresh)}
        >
          {t('run.report.manager.refreshDefinitions')}
        </button>
      </div>
      {reboot === 'requested' ? (
        <span role="status">{t('run.report.manager.restarted')}</span>
      ) : null}
      {reboot === 'failed' ? (
        <span role="status" className="text-destructive">
          {t('run.report.manager.restartFailed', { reason: rebootError ?? '' })}
        </span>
      ) : null}
    </div>
  );
}
