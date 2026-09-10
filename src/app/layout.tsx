import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import AppFooter from '@/components/AppFooter';

export const metadata: Metadata = {
  title: 'Tarkov Map Learner',
  description: 'Fast-paced spatial memory drills for Escape from Tarkov',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased bg-zinc-950 text-zinc-100 min-h-screen">
        {children}
        <AppFooter />
      </body>
    </html>
  );
}
