import { useEffect, useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DialogFrame } from '@/components/ui/dialog';
import { dialogButton } from '@/components/ui/dialog-button';
import { AGREEMENT_LINK } from '@/components/ui/document-body';
import { BYTES_PER_KIB } from '@/components/ui/units';
import { t, tParts } from '@/i18n';
import { downloadText } from '@/lib/download';
import { clearTrace, traceSnapshot, type TraceLevels } from '@/lib/trace';
import {
  buildDiagnostics,
  DEFAULT_SECTIONS,
  DIAGNOSTICS_GROUPS,
  diagnosticsFileName,
  formatDiagnostics,
  readDiagnosticsInputs,
  REQUIRED_SECTIONS,
  type DiagnosticsInputs,
  type DiagnosticsSection,
} from '@/store/diagnostics/diagnostics-file';
import { useDiagnosticsDialogStore } from '@/store/use-diagnostics-dialog-store';
import { useFaultStore } from '@/store/use-fault-store';

// ─────────────────────────────
// 「ログをエクスポート」のダイアログ。**書き出す前に中身の全文を見せる。**
// 外枠に 1 つだけ置き、開くのはストアの印。
// ─────────────────────────────

/** 問い合わせフォーム（本体の外の Worker。プライバシーポリシー 11 と同じ URL） */
const CONTACT_FORM_URL = 'https://contact.kisara-ui.com';

/** 表示している中身と、その時点のログの量 */
interface View {
  readonly text: string;
  readonly faults: number;
  readonly events: number;
  readonly levels: TraceLevels;
}

function viewOf(inputs: DiagnosticsInputs, sections: ReadonlySet<DiagnosticsSection>): View {
  const { faults, events, levels } = traceSnapshot();
  return {
    text: formatDiagnostics(buildDiagnostics(inputs, sections)),
    faults: faults.length,
    events: events.length,
    levels,
  };
}

function levelName(level: TraceLevels[keyof TraceLevels]): string {
  return t(`settings.diagnostics.level.${level}`);
}

/** 説明の一言。「問い合わせフォーム」の所をフォームを開くリンクにする（語順は文言の側が持つ） */
function IntroText(): React.ReactElement {
  return (
    <p className="text-muted-foreground">
      {tParts('settings.diagnostics.dialog.intro').map((part, index) =>
        index % 2 === 0 ? (
          part
        ) : (
          <a
            key={part}
            href={CONTACT_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={AGREEMENT_LINK}
          >
            {t('settings.diagnostics.dialog.contactForm')}
          </a>
        ),
      )}
    </p>
  );
}

function SectionGroups({
  chosen,
  disabled,
  onToggle,
}: {
  readonly chosen: ReadonlySet<DiagnosticsSection>;
  readonly disabled: boolean;
  readonly onToggle: (section: DiagnosticsSection, on: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <p>{t('settings.diagnostics.dialog.sections')}</p>
      {DIAGNOSTICS_GROUPS.map((group) => (
        <fieldset key={group.id} className="flex flex-col gap-1">
          <legend className="text-foreground mb-0.5 font-medium">
            {t(`settings.diagnostics.dialog.group.${group.id}`)}
          </legend>
          {group.sections.map((section) => {
            // 外せない区分は、入れたまま外せない印にする
            const required = REQUIRED_SECTIONS.has(section);
            return (
              <label key={section} className="text-muted-foreground flex items-start gap-2 pl-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={required || chosen.has(section)}
                  disabled={required || disabled}
                  onChange={(event) => onToggle(section, event.target.checked)}
                />
                {t(`settings.diagnostics.dialog.section.${section}`)}
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

/** 閉じるのは見出しの帯の × と Esc（下端には置かない） */
function DiagnosticsBody(): React.ReactElement {
  const [inputs, setInputs] = useState<DiagnosticsInputs | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<DiagnosticsSection>>(
    () => new Set(DEFAULT_SECTIONS),
  );
  // ログは画面の外の入れ物にあるので、読んだ結果を手続きの中で組んで持つ
  const [view, setView] = useState<View | null>(null);
  const [confirming, setConfirming] = useState(false);

  // 開いたときに 1 回だけ、ComfyUI の版と保存領域の使用量を読む
  useEffect(() => {
    let alive = true;
    void readDiagnosticsInputs().then((read) => {
      if (!alive) return;
      setInputs(read);
      setView(viewOf(read, DEFAULT_SECTIONS));
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (section: DiagnosticsSection, on: boolean): void => {
    const next = new Set(chosen);
    if (on) next.add(section);
    else next.delete(section);
    setChosen(next);
    if (inputs !== null) setView(viewOf(inputs, next));
  };

  const clear = (): void => {
    setConfirming(false);
    clearTrace();
    useFaultStore.getState().clear();
    if (inputs !== null) setView(viewOf(inputs, chosen));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col text-sm">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <IntroText />
        {view === null ? null : (
          <p className="text-muted-foreground tabular-nums">
            {t('settings.diagnostics.dialog.counts', { faults: view.faults, events: view.events })}
            {' · '}
            {t('settings.diagnostics.dialog.levels', {
              comfy: levelName(view.levels.comfy),
              llm: levelName(view.levels.llm),
            })}
          </p>
        )}
        <SectionGroups chosen={chosen} disabled={inputs === null} onToggle={toggle} />
        <textarea
          aria-label={t('settings.diagnostics.dialog.content')}
          className="border-input bg-muted/40 h-64 shrink-0 resize-y rounded border p-2 font-mono
            text-xs"
          readOnly
          value={view?.text ?? t('settings.diagnostics.dialog.loading')}
        />
        {/* 中身の枠のすぐ下の行。左に大きさ、右に操作のボタン */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">
            {view === null
              ? null
              : t('settings.diagnostics.dialog.size', {
                  size: (new Blob([view.text]).size / BYTES_PER_KIB).toFixed(1),
                })}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className={dialogButton({ tone: 'secondary' })}
            onClick={() => setConfirming(true)}
          >
            {t('settings.diagnostics.dialog.clear')}
          </button>
          <button
            type="button"
            className={dialogButton({ tone: 'primary' })}
            disabled={view === null}
            onClick={() => {
              if (view !== null) downloadText(view.text, diagnosticsFileName(), 'application/json');
            }}
          >
            {t('settings.diagnostics.dialog.export')}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('settings.diagnostics.dialog.clearTitle')}
        description={t('settings.diagnostics.dialog.clearDescription')}
        confirmLabel={t('settings.diagnostics.dialog.clear')}
        onConfirm={clear}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

/** 外枠に 1 つだけ置く。開いている間だけ中身を組む（閉じると区分の選びは既定に戻る） */
export function DiagnosticsDialog(): React.ReactElement {
  const open = useDiagnosticsDialogStore((state) => state.isOpen);
  const close = useDiagnosticsDialogStore((state) => state.close);
  return (
    <DialogFrame
      id="diagnostics"
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      size="lg"
      embeddable={false}
      fullOnNarrow
      title={t('settings.diagnostics.dialog.title')}
    >
      {open ? <DiagnosticsBody /> : null}
    </DialogFrame>
  );
}
