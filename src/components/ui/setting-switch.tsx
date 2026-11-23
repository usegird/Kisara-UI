import { Switch } from '@base-ui/react/switch';
import { cva } from 'class-variance-authority';

const settingRow = cva('text-muted-foreground flex items-center gap-2 px-1', {
  variants: { spaced: { true: 'mt-2', false: '' } },
});

export interface SettingSwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly spaced?: boolean | undefined;
}

export function SettingSwitch({
  checked,
  onChange,
  label,
  spaced = true,
}: SettingSwitchProps): React.ReactElement {
  return (
    <label className={settingRow({ spaced })}>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        className="group/switch relative -my-1 inline-flex h-6 w-7 shrink-0 items-center rounded-full
          focus-visible:outline-2"
      >
        <span
          aria-hidden
          className="bg-muted-foreground/70 group-data-[checked]/switch:bg-switch-on absolute inset-x-0
            top-1 h-4 rounded-full transition-colors"
        />
        <Switch.Thumb
          className="bg-background relative size-3 translate-x-0.5 rounded-full shadow-sm
            transition-transform data-[checked]:translate-x-3.5"
        />
      </Switch.Root>
      {label}
    </label>
  );
}
