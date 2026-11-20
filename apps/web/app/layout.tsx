import type { Metadata } from 'next';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/components/shared/auth-provider';
import { ConfirmProvider } from '@/components/ui/confirm';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

// Self-hosted at build time by next/font: no request to Google from the browser.
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Tanaw', template: '%s · Tanaw' },
  description: 'AI-assisted security assessment and vulnerability analysis',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${hanken.variable}`}>
      <body>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>{children}</AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
