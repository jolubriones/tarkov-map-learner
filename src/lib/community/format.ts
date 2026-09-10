import { REPORT_REASONS, type ReportReason } from './types';

export function reportReasonLabel(reason: ReportReason): string {
  return REPORT_REASONS.find((r) => r.id === reason)?.label ?? reason;
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" / "Mar 4" style stamps. */
export function timeAgo(isoTimestamp: string): string {
  const then = Date.parse(isoTimestamp);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
