// Visual badge for a gym's "right now" status. Renders a colored dot +
// label using the semantic tokens from `lib/gymStatus.ts`. The dot pulses
// for live states (in session, starting soon).
//
// Usage:
//   const status = computeGymStatus(gym.schedule);
//   <StatusBadge status={status} />
//
// Server-component-safe — no client hooks, pure render.

import type { GymStatus } from '@/lib/gymStatus';
import { STATUS_LABEL, STATUS_COLOR_VAR, isPulseStatus } from '@/lib/gymStatus';

interface StatusBadgeProps {
  status: GymStatus;
  /** Hide on `unknown` so cards without schedule data stay clean. */
  hideUnknown?: boolean;
  /** Smaller variant for tight rows. */
  size?: 'sm' | 'md';
}

export default function StatusBadge({
  status,
  hideUnknown = true,
  size = 'md',
}: StatusBadgeProps) {
  if (hideUnknown && status === 'unknown') return null;

  const color = STATUS_COLOR_VAR[status];
  const label = STATUS_LABEL[status];
  const pulse = isPulseStatus(status);

  const dotSize = size === 'sm' ? 6 : 8;
  const fontSize = size === 'sm' ? 11 : 12;
  const gap = size === 'sm' ? 5 : 6;

  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap,
        fontFamily: "'Inter Tight', sans-serif",
        fontSize,
        fontWeight: 500,
        color: 'var(--text-secondary)',
        lineHeight: 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          background: color,
          boxShadow: pulse ? `0 0 0 0 ${color}` : 'none',
          animation: pulse ? 'status-pulse 1.6s ease-out infinite' : 'none',
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
    </span>
  );
}
