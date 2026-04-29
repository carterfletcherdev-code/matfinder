// Small label primitive — used for discipline tags, day labels, free
// markers, and any "compact metadata" display. Comes in 4 tones aligned
// to the design system's semantic colors.

import type { ReactNode, HTMLAttributes } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
type Size = 'sm' | 'md';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: Size;
  /** Soft = tinted background, normal text. Solid = filled background. */
  variant?: 'soft' | 'solid' | 'outline';
  iconLeft?: ReactNode;
  children: ReactNode;
}

function tokens(tone: Tone) {
  switch (tone) {
    case 'success': return { color: 'var(--success)',    bg: 'rgba(94,139,94,0.12)' };
    case 'warning': return { color: 'var(--warning)',    bg: 'rgba(200,161,69,0.14)' };
    case 'danger':  return { color: 'var(--danger)',     bg: 'rgba(196,53,46,0.10)' };
    case 'accent':  return { color: 'var(--accent)',     bg: 'var(--accent-muted)' };
    case 'neutral': return { color: 'var(--text-secondary)', bg: 'var(--surface-sunken)' };
  }
}

export default function Pill({
  tone = 'neutral',
  size = 'sm',
  variant = 'soft',
  iconLeft,
  children,
  style,
  ...rest
}: Props) {
  const t = tokens(tone);
  const padX = size === 'sm' ? 8 : 10;
  const padY = size === 'sm' ? 3 : 4;
  const fs = size === 'sm' ? 11 : 12;

  let palette: React.CSSProperties;
  if (variant === 'solid') {
    palette = { background: t.color, color: 'var(--bone)', border: '1px solid transparent' };
  } else if (variant === 'outline') {
    palette = { background: 'transparent', color: t.color, border: `1px solid ${t.color}` };
  } else {
    palette = { background: t.bg, color: t.color, border: '1px solid transparent' };
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: `${padY}px ${padX}px`,
        borderRadius: 'var(--radius-full)',
        fontFamily: "'Inter Tight', sans-serif",
        fontSize: fs,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...palette,
        ...style,
      }}
      {...rest}
    >
      {iconLeft && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{iconLeft}</span>}
      {children}
    </span>
  );
}
