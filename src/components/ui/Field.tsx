import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/format';

interface FieldShellProps {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  unit?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function FieldShell({ id, label, error, hint, unit, required, className, children }: FieldShellProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-[13px] font-medium text-fg-muted">
        <span className={error ? 'text-fault' : undefined}>{label}</span>
        {required && <span className="text-accent/80" aria-hidden>*</span>}
        {unit && <span className="num ml-auto text-fg-dim">{unit}</span>}
      </label>
      {children}
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p
            key="err"
            id={`${id}-err`}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="num text-[13px] leading-tight text-fault"
          >
            ▲ {error}
          </motion.p>
        ) : hint ? (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="num text-[13px] leading-tight text-fg-dim"
          >
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const controlBase =
  'w-full rounded-[10px] border bg-ink-850 text-fg shadow-[inset_0_1px_2px_rgb(22_32_42/0.05)] transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-line-strong focus-within:border-accent focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_14%,transparent)]';

const inputBase =
  'h-11 w-full bg-transparent px-3.5 text-[15px] text-fg outline-none placeholder:text-fg-dim/70 ' +
  'disabled:cursor-not-allowed disabled:text-fg-dim focus-visible:outline-none';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  error?: string;
  hint?: ReactNode;
  unit?: string;
  mono?: boolean;
  fieldClassName?: string;
  leading?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, unit, mono, required, fieldClassName, leading, id: idProp, className, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} unit={unit} required={required} className={fieldClassName}>
      <div
        className={cn(
          controlBase,
          'flex items-center',
          error ? 'border-fault/70' : 'border-line',
          disabled && 'opacity-50',
        )}
      >
        {leading && <span className="pl-3 text-fg-dim">{leading}</span>}
        <input
          ref={ref}
          id={id}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={cn(inputBase, mono && 'num', className)}
          {...rest}
        />
      </div>
    </FieldShell>
  );
});

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label: string;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  error?: string;
  hint?: ReactNode;
  fieldClassName?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
  hint,
  required,
  fieldClassName,
  id: idProp,
  disabled,
  ...rest
}: SelectFieldProps<T>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={fieldClassName}>
      <div
        className={cn(
          controlBase,
          'relative',
          error ? 'border-fault/70' : 'border-line',
          disabled && 'opacity-50',
        )}
      >
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as T)}
          className={cn(inputBase, 'cursor-pointer appearance-none pr-9 [&>option]:bg-ink-800')}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-dim" />
      </div>
    </FieldShell>
  );
}
