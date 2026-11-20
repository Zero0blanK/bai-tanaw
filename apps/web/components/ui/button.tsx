import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  primary: 'bg-black text-white hover:bg-ink-700 disabled:bg-ink-300',
  secondary: 'border border-black bg-white text-black hover:bg-ink-100 disabled:border-ink-300 disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-400',
  /** Opens a destructive flow (e.g. "Delete…"); quiet so it doesn't compete with the primary action. */
  danger: 'border border-signal bg-white text-signal hover:bg-red-50 disabled:border-ink-300 disabled:text-ink-400',
  /** Performs the destructive action, inside a confirmation dialog. */
  destructive: 'bg-signal text-white hover:bg-red-800 disabled:bg-ink-300',
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
