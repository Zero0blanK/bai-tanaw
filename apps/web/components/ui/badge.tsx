import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Badge tones are only the colour of a small square marker; the label is always black text on white with a
 * hairline, so meaning never depends on colour alone and a page full of badges stays quiet.
 */
export const TONES = {
  slate: '#b8b8b3',
  blue: '#1f4fd1',
  green: '#1e7b4b',
  amber: '#e39b17',
  orange: '#e8871e',
  red: '#d52b1e',
  purple: '#6b3fd1',
  brand: '#000000',
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = 'slate', children, className, title, solid }: { tone?: Tone; children: ReactNode; className?: string; title?: string | undefined; solid?: boolean }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap border px-1.5 py-[3px] text-xs leading-none font-semibold',
        solid ? 'border-transparent text-white' : 'border-ink-200 bg-white text-ink-800',
        className,
      )}
      style={solid ? { backgroundColor: TONES[tone] } : undefined}
    >
      {!solid && <span aria-hidden className="h-2 w-2 shrink-0" style={{ backgroundColor: TONES[tone] }} />}
      {children}
    </span>
  );
}
