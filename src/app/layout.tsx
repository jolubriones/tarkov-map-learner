import type { Metadata } from 'next';
import './globals.css';

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
      </body>
    </html>
  );
}
