import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import AppFooter from '@/components/AppFooter';
import { SITE_URL } from '@/lib/site';

const SITE_NAME = 'Tarkov Map Learner';
const SITE_DESCRIPTION =
  'Fast-paced spatial memory drills for Escape from Tarkov. Learn Customs extracts, landmarks, and compass directions through quick-fire quizzes.';

const OG_IMAGE = {
  url: `${SITE_URL}/opengraph-image.png`,
  width: 1200,
  height: 630,
  alt: 'Tarkov Map Learner — Customs map drills',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Tarkov Map Learner — Customs Map Drills',
    template: '%s | Tarkov Map Learner',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'Escape from Tarkov',
    'Tarkov',
    'Customs map',
    'Tarkov extracts',
    'Tarkov landmarks',
    'learn Tarkov maps',
    'Tarkov quiz',
    'Tarkov drills',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  // Share image lives at public/opengraph-image.png (see docs/seo.md
  // to regenerate it — the file-convention route emits extensionless
  // URLs under `output: 'export'`, which social scrapers reject).
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: 'Tarkov Map Learner — Customs Map Drills',
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tarkov Map Learner — Customs Map Drills',
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased bg-zinc-950 text-zinc-100 min-h-screen">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <AppFooter />
      </body>
    </html>
  );
}
