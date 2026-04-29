// Surface primitive. A bordered, raised container that uses the design
// tokens for surface, border, radius, and shadow. Default elevation is
// `sm`; `md` is for hover/active state; `lg` for hero panels and modals.
//
// Use `interactive` to add a hover lift + shadow shift. `selected` pins
// it to the elevated style.

import type { HTMLAttributes, ReactNode, ElementType } from 'react';

type Elevation = 'flat' | 'sm' | 'md' | 'lg';

interface Props extends HTMLAttributes<HTMLElement> {
  /** Default rendered element. Use `as="article"` / `"a"` / `"li"` etc. */
  as?: ElementType;
  elevation?: Elevation;
  /** Adds hover lift + shadow shift. */
  interactive?: boolean;
  /** Forces the elevated/active visual state. */
  selected?: boolean;
  /** Drop the inner padding (useful when the card wraps a media block). */
  noPad?: boolean;
  children?: ReactNode;
}

const shadowVar: Record<Elevation, string> = {
  flat: 'none',
  sm:   'var(--shadow-sm)',
  md:   'var(--shadow-md)',
  lg:   'var(--shadow-lg)',
};

export default function Card({
  as: As = 'div',
  elevation = 'sm',
  interactive = false,
  selected = false,
  noPad = false,
  style,
  children,
  ...rest
}: Props) {
  const baseStyle: React.CSSProperties = {
    background: selected ? 'var(--card-sel-bg, var(--surface-raised))' : 'var(--surface-raised)',
    color: selected ? 'var(--card-sel-text, var(--text-primary))' : 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: shadowVar[elevation],
    padding: noPad ? 0 : 14,
    transition: 'box-shadow 150ms ease, transform 150ms ease, border-color 150ms ease, background 150ms ease',
    ...style,
  };

  const onMouseEnter = interactive ? (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
    e.currentTarget.style.transform = 'translateY(-1px)';
    e.currentTarget.style.borderColor = 'var(--accent-muted)';
  } : undefined;

  const onMouseLeave = interactive ? (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.boxShadow = shadowVar[elevation];
    e.currentTarget.style.transform = '';
    e.currentTarget.style.borderColor = 'var(--border)';
  } : undefined;

  return (
    <As
      style={baseStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...rest}
    >
      {children}
    </As>
  );
}
