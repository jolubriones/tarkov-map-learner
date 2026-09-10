import type { Metadata } from 'next';
import './globals.css';
import AppFooter from '@/components/AppFooter';

export const metadata: Metadata = {
  title: 'Tarkov Map Learner',
  description: 'Fast-paced spatial memory drills for Escape from Tarkov',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
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
