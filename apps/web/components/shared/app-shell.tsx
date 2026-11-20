'use client';

import type { Role } from '@tanaw/shared';
import { Bug, FileClock, LayoutDashboard, LogOut, Settings, Target, UserRound, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn, humanize } from '@/lib/utils';
import { useAuth } from './auth-provider';
import { TanawMark } from './brand';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Target;
  roles?: Role[];
}

/** Two groups: the assessment work everyone does, and administration (admins only). */
const NAV: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Assess',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/targets', label: 'Targets', icon: Target },
      { href: '/findings', label: 'Findings', icon: Bug },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
      { href: '/audit', label: 'Audit log', icon: FileClock, roles: ['ADMIN'] },
      { href: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
    ],
  },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout, can } = useAuth();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((n) => !n.roles || can(...n.roles)) })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-full md:flex print:block">
      <aside className="bg-ink-900 text-ink-300 md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col print:hidden">
        <Link href="/dashboard" className="flex h-16 items-center gap-2.5 px-5 text-white">
          <TanawMark className="h-7 w-7" />
          <span className="font-display text-xl font-semibold tracking-tight">Tanaw</span>
        </Link>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-6 md:overflow-visible md:pt-4" aria-label="Main">
          {groups.map((group) => (
            <div key={group.label} className="flex gap-1 md:flex-col">
              <p className="hidden px-3 pb-1 text-xs font-semibold text-ink-400 md:block">{group.label}</p>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {active && <span className="absolute inset-y-2 left-0 hidden w-0.5 rounded-full bg-brand-300 md:block" aria-hidden />}
                    <Icon className={cn('h-[18px] w-[18px]', active ? 'text-brand-300' : 'text-ink-400')} aria-hidden />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {user && (
          <div className="hidden border-t border-white/10 p-3 md:block">
            <Link
              href="/account"
              aria-current={isActive('/account') ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5', isActive('/account') && 'bg-white/10')}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 font-display text-sm font-semibold text-white">
                {initials(user.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
                <span className="block truncate text-xs text-ink-400">{humanize(user.role)}</span>
              </span>
            </Link>
            <button
              onClick={() => void logout()}
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex-1 md:ml-64 print:m-0">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 md:py-10 print:p-0">{children}</div>
        {user && (
          <div className="mx-4 mb-6 flex items-center justify-between border-t border-ink-200 pt-4 text-sm text-ink-500 md:hidden print:hidden">
            <Link href="/account" className="flex items-center gap-2">
              <UserRound className="h-4 w-4" aria-hidden />
              {user.name}
            </Link>
            <button onClick={() => void logout()} className="font-medium text-ink-700">
              Sign out
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
