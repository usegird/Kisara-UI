// ─────────────────────────────
// タブごとに分ける画面の状態（ダイアログが開いているかと、その対象）。ストアが自分の分を登録し、
// タブを切り替えるときにタブのストアがまとめて控え・戻す（端末には残さない）。
// ─────────────────────────────

/** タブごとに分ける状態の控え方と戻し方。控えが無いとき（新しいタブ）は閉じた状態に戻す */
interface TabScoped {
  /** 今の状態を控える。何も開いていなければ undefined */
  readonly capture: () => unknown;
  /** 控えを戻す。undefined なら閉じた状態にする */
  readonly restore: (saved: unknown) => void;
}

const entries = new Map<string, TabScoped>();

/** 登録する（ストアの読み込み時に 1 回）。同じ名前は置き換える */
export function registerTabScoped(key: string, scoped: TabScoped): void {
  entries.set(key, scoped);
}

/** 1 つの値（開いている対象）だけを控える状態の読み方と開き方 */
interface TabScopedValue<T> {
  /** 今開いている対象。閉じていれば null */
  readonly current: () => T | null;
  /** 控えが戻せる値か */
  readonly isValue: (saved: unknown) => saved is T;
  readonly open: (value: T) => void;
  readonly close: () => void;
}

/**
 * 開いている対象 1 つだけを控える状態を登録する。控えが無い・形が違えば、開いていたときだけ閉じる
 */
export function registerTabScopedValue<T>(key: string, scoped: TabScopedValue<T>): void {
  registerTabScoped(key, {
    capture: () => scoped.current() ?? undefined,
    restore: (saved) => {
      if (scoped.isValue(saved)) scoped.open(saved);
      else if (scoped.current() !== null) scoped.close();
    },
  });
}

/** 今のタブの分をまとめて控える */
export function captureTabScoped(): Readonly<Record<string, unknown>> {
  const saved: Record<string, unknown> = {};
  for (const [key, scoped] of entries) {
    const value = scoped.capture();
    if (value !== undefined) saved[key] = value;
  }
  return saved;
}

/** 控えをまとめて戻す。控えに無いものは閉じる */
export function restoreTabScoped(saved: Readonly<Record<string, unknown>> | undefined): void {
  for (const [key, scoped] of entries) scoped.restore(saved?.[key]);
}
