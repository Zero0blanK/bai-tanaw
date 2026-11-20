import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  primary: 'bg-brand-600 text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)] hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-400',
  /** Opens a destructive flow (e.g. "Delete…"); quiet so it doesn't compete with the primary action. */
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:text-red-300',
  /** Performs the destructive action, inside a confirmation dialog. */
  destructive: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
} as const;

const SIZES = { sm: 'h-8 px-3 text-xs', md: 'h-9 px-4 text-sm', lg: 'h-11 px-5 text-[15px]' } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold whitespace-nowrap transition-colors duration-[var(--duration-fast)] active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
