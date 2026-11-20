'use client';

import type { Role } from '@tanaw/shared';
import { Bug, FileClock, KeyRound, LayoutDashboard, LogOut, ShieldCheck, Target, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn, humanize } from '@/lib/utils';
import { useAuth } from './auth-provider';

const NAV: Array<{ href: string; label: string; icon: typeof Target; roles?: Role[] }> = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/targets', label: 'Targets', icon: Target },
  { href: '/findings', label: 'Findings', icon: Bug },
  { href: '/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
  { href: '/audit', label: 'Audit log', icon: FileClock, roles: ['ADMIN'] },
  { href: '/account', label: 'Account', icon: KeyRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout, can } = useAuth();

  return (
    <div className="flex min-h-full flex-col md:flex-row print:block">
      <aside className="border-b border-slate-200 bg-white md:fixed md:inset-y-0 md:w-56 md:border-b-0 md:border-r print:hidden">
        <div className="flex h-14 items-center gap-2 px-5">
          <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden />
          <span className="text-lg font-semibold tracking-tight text-brand-700">Tanaw</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0" aria-label="Main">
          {NAV.filter((n) => !n.roles || can(...n.roles)).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium',
                  active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        {user && (
          <div className="hidden border-t border-slate-200 p-4 md:absolute md:inset-x-0 md:bottom-0 md:block">
            <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <div className="mt-2 flex items-center justify-between">
              <Badge tone="brand">{humanize(user.role)}</Badge>
              <button onClick={() => void logout()} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900">
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Sign out
              </button>
            </div>
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:ml-56 md:px-8 print:m-0 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
        {user && (
          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500 md:hidden">
            <span>
              {user.name} · {humanize(user.role)}
            </span>
            <button onClick={() => void logout()} className="underline">
              Sign out
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
