import { Search } from 'lucide-react';
import type { ComponentProps, LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const control =
  'block w-full rounded-[var(--radius-control)] border border-ink-300 bg-white px-3 py-2 text-sm text-black placeholder:text-ink-400 transition-colors hover:border-ink-500 focus:border-black focus:outline-none focus:ring-1 focus:ring-black disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500 aria-invalid:border-signal aria-invalid:focus:ring-signal';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-[88px] leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(control, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

/** Text input with a search icon. The label stays available to screen readers via `label`. */
export function SearchInput({ label, className, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <input type="search" aria-label={label} className={cn(control, 'h-10 pl-9')} {...props} />
    </div>
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-[13px] font-bold text-black', className)} {...props} />;
}

/** Ids the control should point at with aria-describedby, so hints and errors are read with the field. */
export function fieldDescribedBy(htmlFor: string, { hint, error }: { hint?: unknown; error?: unknown }): string | undefined {
  const ids = [hint ? `${htmlFor}-hint` : null, error ? `${htmlFor}-error` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

/**
 * Label + control + hint + error, stacked. `required` adds a visible marker (the control still needs `required`).
 * Pass the same `error` to the control as `aria-invalid` and `fieldDescribedBy()` as its aria-describedby.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null | undefined;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-0.5 text-signal" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs font-semibold text-signal">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs leading-relaxed text-ink-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** Groups Zod issues by top-level field: `{ base_url: 'Invalid URL' }`. The first message per field wins. */
export function issuesByField(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_form');
    out[key] ??= issue.message.charAt(0).toUpperCase() + issue.message.slice(1);
  }
  return out;
}
