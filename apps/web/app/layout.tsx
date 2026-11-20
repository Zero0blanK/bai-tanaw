import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/components/shared/auth-provider';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Tanaw', template: '%s · Tanaw' },
  description: 'AI-assisted security assessment and vulnerability analysis',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
