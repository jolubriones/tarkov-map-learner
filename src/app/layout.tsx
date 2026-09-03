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
    <html lang="en">
      <body suppressHydrationWarning className="antialiased">
        {children}
      </body>
    </html>
  );
}