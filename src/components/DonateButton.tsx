import React from 'react';
import { ExternalLink, HeartHandshake } from 'lucide-react';
import { monetizationConfig } from '@/lib/monetization';

interface DonateButtonProps {
  variant?: 'cta' | 'icon' | 'link';
  className?: string;
}

/**
 * Donation entry point. Renders `null` until `NEXT_PUBLIC_DONATION_URL`
 * is configured, so placements can ship now and light up later.
 *
 * - `cta`: full-width button for natural breaks (e.g. game-over screen).
 * - `icon`: ghost icon button for the drill header.
 * - `link`: subtle inline link for the footer.
 */
export default function DonateButton({
  variant = 'cta',
  className = '',
}: DonateButtonProps) {
  const { enabled, url, platform, message } = monetizationConfig.donations;

  if (!enabled || !url) return null;

  if (variant === 'icon') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${message} on ${platform}`}
        aria-label={`${message} on ${platform}`}
        className={`p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors ${className}`}
      >
        <HeartHandshake className="w-5 h-5" />
      </a>
    );
  }

  if (variant === 'link') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 text-zinc-500 hover:text-amber-400 transition-colors ${className}`}
      >
        {message}
        <ExternalLink className="w-3 h-3" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`w-full py-3 rounded-xl font-bold text-center bg-amber-600/15 border border-amber-700/60 hover:bg-amber-600/25 text-amber-300 transition-colors flex items-center justify-center gap-2 ${className}`}
    >
      <HeartHandshake className="w-5 h-5" />
      {message} on {platform}
    </a>
  );
}
