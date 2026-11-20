'use client';

import type { Role } from '@tanaw/shared';
import {
  Bug,
  ChevronRight,
  FileClock,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Target,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Menu } from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { cn, humanize } from '@/lib/utils';
import type { Dashboard } from '@/types/api';
import { useAuth } from './auth-provider';
import { TanawMark } from './brand';
import { GlobalSearch } from './global-search';
import { ShellProvider } from './shell-context';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Target;
  roles?: Role[];
}

/** Assessment work everyone does, then administration (admins only). Account lives in the profile menu. */
const NAV: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Assess',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/targets', label: 'Targets', icon: Target },
      { href: '/findings', label: 'Findings', icon: Bug },
      { href: '/reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/users', label: 'Users & roles', icon: Users, roles: ['ADMIN'] },
      { href: '/audit', label: 'Audit log', icon: FileClock, roles: ['ADMIN'] },
      { href: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
    ],
  },
];

const EXTRA_SECTIONS: Record<string, { group: string; label: string }> = {
  '/account': { group: 'You', label: 'Account' },
  '/scans': { group: 'Assess', label: 'Scans' },
};

const COLLAPSE_KEY = 'tanaw.sidebar.collapsed';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
  } catch {
    // Storage can be blocked; the sidebar still works for this visit.
  }
}

function Sidebar({ collapsed, onNavigate, isActive, groups }: { collapsed: boolean; onNavigate?: () => void; isActive: (href: string) => boolean; groups: typeof NAV }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className={cn('px-3 pb-1.5 text-xs font-semibold text-ink-400', collapsed && 'sr-only')}>{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              const link = (
                <Link
                  href={href}
                  {...(onNavigate ? { onClick: onNavigate } : {})}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? label : undefined}
                  className={cn(
                    'relative flex items-center gap-3 rounded-[var(--radius-control)] py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)]',
                    collapsed ? 'justify-center px-0' : 'px-3',
                    active ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white',
                  )}
                >
                  {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-300" aria-hidden />}
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-brand-300' : 'text-ink-400')} aria-hidden />
                  {!collapsed && label}
                </Link>
              );
              return (
                <li key={href} className={cn(collapsed && 'flex justify-center')}>
                  {collapsed ? (
                    <Tooltip content={label} side="right">
                      {link}
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout, can } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => setCollapsed(readCollapsed()), []);
  // Close the mobile drawer on navigation, and on Escape.
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);
  // The waiting-for-verification count, refreshed on every navigation (real data, not a notification feed).
  useEffect(() => {
    let cancelled = false;
    void api<Dashboard>('/dashboard')
      .then((r) => !cancelled && setPending(r.data.totals.pending_review))
      .catch(() => !cancelled && setPending(null));
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const isActive = useCallback((href: string) => pathname === href || pathname.startsWith(`${href}/`), [pathname]);
  const groups = useMemo(
    () => NAV.map((g) => ({ ...g, items: g.items.filter((n) => !n.roles || can(...n.roles)) })).filter((g) => g.items.length > 0),
    [can],
  );
  const section = useMemo(() => {
    for (const g of NAV) for (const item of g.items) if (isActive(item.href)) return { group: g.label, label: item.label, href: item.href };
    const extra = Object.entries(EXTRA_SECTIONS).find(([href]) => isActive(href));
    return extra ? { group: extra[1].group, label: extra[1].label, href: extra[0] } : null;
  }, [isActive]);
  const isDetail = section !== null && pathname !== section.href;
  const shell = useMemo(() => ({ setDetail }), []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      writeCollapsed(!v);
      return !v;
    });
  }

  const brand = (compact: boolean) => (
    <Link href="/dashboard" className={cn('flex h-[var(--spacing-topbar)] shrink-0 items-center gap-2.5 text-white', compact ? 'justify-center px-0' : 'px-5')}>
      <TanawMark className="h-7 w-7 shrink-0" />
      {!compact && <span className="font-display text-xl font-semibold tracking-tight">Tanaw</span>}
      {compact && <span className="sr-only">Tanaw dashboard</span>}
    </Link>
  );

  return (
    <ShellProvider value={shell}>
      <div className="min-h-full print:block">
        <a href="#main" className="sr-only z-50 rounded bg-white px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>

        {/* Desktop sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 hidden flex-col bg-ink-900 transition-[width] duration-[var(--duration-base)] ease-[var(--ease-standard)] lg:flex print:hidden',
            collapsed ? 'w-[var(--spacing-sidebar-collapsed)]' : 'w-[var(--spacing-sidebar)]',
          )}
        >
          {brand(collapsed)}
          <Sidebar collapsed={collapsed} isActive={isActive} groups={groups} />
        </aside>

        {/* Mobile and tablet drawer */}
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden print:hidden">
            <button type="button" className="absolute inset-0 bg-ink-950/50" aria-label="Close navigation" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-ink-900 shadow-[var(--shadow-overlay)]" aria-label="Navigation">
              <div className="flex items-center justify-between pr-3">
                {brand(false)}
                <button type="button" onClick={() => setDrawer(false)} className="grid h-10 w-10 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white" aria-label="Close navigation">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <Sidebar collapsed={false} isActive={isActive} groups={groups} onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}

        <div
          className={cn(
            'flex min-h-full flex-col transition-[padding] duration-[var(--duration-base)] ease-[var(--ease-standard)] print:p-0',
            collapsed ? 'lg:pl-[var(--spacing-sidebar-collapsed)]' : 'lg:pl-[var(--spacing-sidebar)]',
          )}
        >
          <header className="sticky top-0 z-20 flex h-[var(--spacing-topbar)] items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6 print:hidden">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-ink-600 hover:bg-ink-100 lg:hidden"
              aria-label="Open navigation"
            >
              <MenuIcon className="h-5 w-5" aria-hidden />
            </button>
            <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="bottom">
              <button
                type="button"
                onClick={toggleCollapsed}
                className="hidden h-9 w-9 place-items-center rounded-[var(--radius-control)] text-ink-500 hover:bg-ink-100 hover:text-ink-800 lg:grid"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-pressed={collapsed}
              >
                {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden /> : <PanelLeftClose className="h-5 w-5" aria-hidden />}
              </button>
            </Tooltip>

            {section && (
              <nav aria-label="Breadcrumb" className="hidden min-w-0 md:block">
                <ol className="flex items-center gap-1.5 text-sm">
                  <li className="text-ink-400">{section.group}</li>
                  <li aria-hidden>
                    <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
                  </li>
                  <li className="min-w-0">
                    {isDetail ? (
                      <Link href={section.href} className="font-medium text-ink-600 hover:text-brand-700">
                        {section.label}
                      </Link>
                    ) : (
                      <span aria-current="page" className="font-semibold text-ink-900">
                        {section.label}
                      </span>
                    )}
                  </li>
                  {isDetail && detail && (
                    <>
                      <li aria-hidden>
                        <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
                      </li>
                      <li aria-current="page" className="max-w-[18rem] truncate font-semibold text-ink-900">
                        {detail}
                      </li>
                    </>
                  )}
                </ol>
              </nav>
            )}

            <div className="ml-auto flex flex-1 items-center justify-end gap-2 sm:gap-3">
              <div className="hidden flex-1 justify-end sm:flex">
                <GlobalSearch />
              </div>
              {pending !== null && (
                <Tooltip content={pending > 0 ? `${pending} finding${pending === 1 ? '' : 's'} waiting for verification` : 'Nothing waiting for verification'} side="bottom">
                  <Link
                    href="/findings?status=PENDING"
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-semibold transition-colors',
                      pending > 0 ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-ink-200 text-ink-500 hover:bg-ink-50',
                    )}
                    aria-label={`${pending} findings waiting for verification`}
                  >
                    <Bug className="h-4 w-4" aria-hidden />
                    <span className="tabular-nums">{pending}</span>
                    <span className="hidden xl:inline">to verify</span>
                  </Link>
                </Tooltip>
              )}
              {user && (
                <Menu
                  label="Account menu"
                  triggerClassName="flex items-center gap-2 rounded-full p-0.5 pr-0.5 transition-colors hover:bg-ink-100 sm:pr-3"
                  trigger={
                    <>
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 font-display text-xs font-semibold text-white">{initials(user.name)}</span>
                      <span className="hidden max-w-32 truncate text-sm font-semibold text-ink-800 sm:block">{user.name}</span>
                    </>
                  }
                  header={
                    <>
                      <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
                      <p className="truncate text-xs text-ink-500">{user.email}</p>
                      <p className="mt-1 text-xs font-semibold text-brand-700">{humanize(user.role)}</p>
                    </>
                  }
                  items={[
                    { kind: 'link', label: 'Account and password', href: '/account', icon: <UserRound className="h-4 w-4" aria-hidden /> },
                    ...(can('ADMIN') ? [{ kind: 'link' as const, label: 'Settings', href: '/settings', icon: <Settings className="h-4 w-4" aria-hidden /> }] : []),
                    { kind: 'separator' },
                    { kind: 'action', label: 'Sign out', onSelect: () => void logout(), icon: <LogOut className="h-4 w-4" aria-hidden /> },
                  ]}
                />
              )}
            </div>
          </header>

          <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10 print:p-0">{children}</div>
          </main>
        </div>
      </div>
    </ShellProvider>
  );
}
