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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Menu } from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';
import { api, DATA_CHANGED_EVENT, PENDING_CHANGED_EVENT } from '@/lib/api';
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

function Sidebar({ collapsed, onNavigate, isActive, groups, counts }: { collapsed: boolean; onNavigate?: () => void; isActive: (href: string) => boolean; groups: typeof NAV; counts: Record<string, number | null> }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className={cn('border-b border-ink-200 px-3 pb-1.5 text-xs font-bold text-black', collapsed && 'sr-only')}>{group.label}</p>
          <ul className="mt-1">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              const link = (
                <Link
                  href={href}
                  {...(onNavigate ? { onClick: onNavigate } : {})}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? label : undefined}
                  className={cn(
                    'relative flex items-center gap-3 py-2 text-sm transition-colors duration-[var(--duration-fast)]',
                    collapsed ? 'justify-center px-0' : 'px-3',
                    active ? 'bg-ink-100 font-bold text-black' : 'font-medium text-ink-600 hover:bg-ink-50 hover:text-black',
                  )}
                >
                  {active && <span className="absolute inset-y-0 left-0 w-[3px] bg-black" aria-hidden />}
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-black' : 'text-ink-400')} aria-hidden />
                  {!collapsed && <span className="flex-1">{label}</span>}
                  {!collapsed && counts[href] ? (
                    <span className="text-xs font-bold tabular-nums text-amber-600" aria-label={`${counts[href]} waiting`}>
                      {counts[href]}
                    </span>
                  ) : null}
                  {collapsed && counts[href] ? <span className="absolute top-1 right-2 h-2 w-2 bg-amber-500" aria-hidden /> : null}
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
  // The waiting-for-verification count (real data, not a notification feed). Refreshed on navigation, right after
  // any change made in the app, when the tab becomes visible again, and every 15 s while it is visible, so findings
  // the worker creates during an assessment show up without a reload.
  const lastPending = useRef<number | null>(null);
  const loadPending = useCallback(() => {
    void api<Dashboard>('/dashboard')
      .then((r) => {
        const next = r.data.totals.pending_review;
        if (lastPending.current !== null && lastPending.current !== next) window.dispatchEvent(new Event(PENDING_CHANGED_EVENT));
        lastPending.current = next;
        setPending(next);
      })
      .catch(() => setPending(null));
  }, []);
  useEffect(() => loadPending(), [pathname, loadPending]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadPending();
    };
    window.addEventListener(DATA_CHANGED_EVENT, loadPending);
    window.addEventListener('focus', loadPending);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadPending();
    }, 15_000);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, loadPending);
      window.removeEventListener('focus', loadPending);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [loadPending]);

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
  const counts = useMemo<Record<string, number | null>>(() => ({ '/findings': pending }), [pending]);
  const shell = useMemo(() => ({ setDetail }), []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      writeCollapsed(!v);
      return !v;
    });
  }

  const brand = (compact: boolean) => (
    <Link href="/dashboard" className={cn('flex h-[var(--spacing-topbar)] shrink-0 items-center gap-2.5 border-b-[3px] border-black text-black', compact ? 'justify-center px-0' : 'px-4')}>
      <TanawMark className="h-7 w-7 shrink-0" />
      {!compact && <span className="font-display text-2xl font-extrabold">Bai-Tanaw</span>}
      {compact && <span className="sr-only">Bai-Tanaw dashboard</span>}
    </Link>
  );

  return (
    <ShellProvider value={shell}>
      <div className="min-h-full print:block">
        <a href="#main" className="sr-only z-50 rounded-none bg-white px-3 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>

        {/* Desktop sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-ink-200 bg-white transition-[width] duration-[var(--duration-base)] ease-[var(--ease-standard)] lg:flex print:hidden',
            collapsed ? 'w-[var(--spacing-sidebar-collapsed)]' : 'w-[var(--spacing-sidebar)]',
          )}
        >
          {brand(collapsed)}
          <Sidebar collapsed={collapsed} isActive={isActive} groups={groups} counts={counts} />
        </aside>

        {/* Mobile and tablet drawer */}
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden print:hidden">
            <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r-2 border-black bg-white" aria-label="Navigation">
              <div className="flex items-center justify-between pr-3">
                {brand(false)}
                <button type="button" onClick={() => setDrawer(false)} className="grid h-10 w-10 place-items-center text-ink-600 hover:bg-ink-100 hover:text-black" aria-label="Close navigation">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <Sidebar collapsed={false} isActive={isActive} groups={groups} counts={counts} onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        )}

        <div
          className={cn(
            'flex min-h-full flex-col transition-[padding] duration-[var(--duration-base)] ease-[var(--ease-standard)] print:p-0',
            collapsed ? 'lg:pl-[var(--spacing-sidebar-collapsed)]' : 'lg:pl-[var(--spacing-sidebar)]',
          )}
        >
          <header className="sticky top-0 z-20 flex h-[var(--spacing-topbar)] items-center gap-3 border-b-[3px] border-black bg-white px-4 sm:px-6 print:hidden">
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
                  <li className="text-ink-500">{section.group}</li>
                  <li aria-hidden>
                    <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
                  </li>
                  <li className="min-w-0">
                    {isDetail ? (
                      <Link href={section.href} className="font-medium text-ink-600 underline-offset-4 hover:text-black hover:underline">
                        {section.label}
                      </Link>
                    ) : (
                      <span aria-current="page" className="font-bold text-black">
                        {section.label}
                      </span>
                    )}
                  </li>
                  {isDetail && detail && (
                    <>
                      <li aria-hidden>
                        <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
                      </li>
                      <li aria-current="page" className="max-w-[18rem] truncate font-bold text-black">
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
                      'inline-flex h-9 items-center gap-2 border px-3 text-sm font-bold transition-colors',
                      pending > 0 ? 'border-amber-500 bg-amber-400 text-black hover:bg-amber-300' : 'border-ink-300 text-ink-500 hover:bg-ink-50',
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
                  triggerClassName="flex items-center gap-2 p-0.5 pr-0.5 transition-colors hover:bg-ink-100 sm:pr-3"
                  trigger={
                    <>
                      <span className="grid h-8 w-8 place-items-center bg-black text-xs font-bold text-white">{initials(user.name)}</span>
                      <span className="hidden max-w-32 truncate text-sm font-bold text-black sm:block">{user.name}</span>
                    </>
                  }
                  header={
                    <>
                      <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
                      <p className="truncate text-xs text-ink-500">{user.email}</p>
                      <p className="mt-1 text-xs font-bold text-black">{humanize(user.role)}</p>
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
            <div className="mx-auto max-w-[90rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-6 print:p-0">{children}</div>
          </main>
        </div>
      </div>
    </ShellProvider>
  );
}
