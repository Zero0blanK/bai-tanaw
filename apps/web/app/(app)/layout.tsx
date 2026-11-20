'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/shared/app-shell';
import { useAuth } from '@/components/shared/auth-provider';
import { Spinner } from '@/components/ui/feedback';

/** Every signed-in page. Sends visitors without a session to /login. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner label="Checking your session…" />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
