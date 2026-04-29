// Reusable button primitive. Three variants + three sizes. Consistent
// hover/active/focus states across the app.
//
// Variants:
//   primary  — solid accent fill, used for the single most important CTA
//   secondary — bone outline, used for non-primary actions
//   ghost    — text-only, no border, for tertiary
//
// Sizes:
//   sm — 28px tall, compact rows
//   md — 36px tall, default
//   lg — 44px tall, hero / mobile thumb-friendly
//
// Always renders a real <button>. `as="a"` opens an <a>; useful for
// link-style CTAs that need to behave like buttons (Stripe redirects, etc.).

'use client';

import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

type CommonProps = {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
};

type ButtonAsButton = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & {
  as?: 'button';
};
type ButtonAsAnchor = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & {
  as: 'a';
  href: string;
};
type Props = ButtonAsButton | ButtonAsAnchor;

const sizeStyles: Record<Size, { h: number; px: number; fs: number; gap: number; r: string }> = {
  sm: { h: 28, px: 10, fs: 12, gap: 6,  r: 'var(--radius-sm)' },
  md: { h: 36, px: 14, fs: 13, gap: 8,  r: 'var(--radius-md)' },
  lg: { h: 44, px: 18, fs: 15, gap: 10, r: 'var(--radius-md)' },
};

function variantStyles(variant: Variant, isDisabled: boolean): React.CSSProperties {
  if (isDisabled) {
    return {
      background: 'var(--surface-sunken)',
      color: 'var(--text-muted)',
      border: '1px solid var(--border)',
      cursor: 'not-allowed',
    };
  }
  switch (variant) {
    case 'primary':
      return {
        background: 'var(--accent)',
        color: 'var(--bone)',
        border: '1px solid var(--accent)',
      };
    case 'secondary':
      return {
        background: 'transparent',
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
      };
    case 'ghost':
      return {
        background: 'transparent',
        color: 'var(--text-primary)',
        border: '1px solid transparent',
      };
  }
}

export default function Button(props: Props) {
  const {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    iconLeft,
    iconRight,
    children,
    style: propStyle,
    as,
    ...rest
  } = props as CommonProps & {
    as?: 'a' | 'button';
    style?: React.CSSProperties;
    [key: string]: unknown;
  };

  const isDisabled = loading || ('disabled' in props && (props as { disabled?: boolean }).disabled === true);
  const sz = sizeStyles[size];
  const vs = variantStyles(variant, !!isDisabled);

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sz.gap,
    height: sz.h,
    padding: `0 ${sz.px}px`,
    borderRadius: sz.r,
    fontSize: sz.fs,
    fontWeight: 600,
    fontFamily: "'Inter Tight', sans-serif",
    lineHeight: 1,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    width: fullWidth ? '100%' : undefined,
    transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease, transform 100ms ease, box-shadow 150ms ease',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    ...vs,
    ...propStyle,
  };

  const content = (
    <>
      {iconLeft && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{iconLeft}</span>}
      <span>{loading ? '…' : children}</span>
      {iconRight && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{iconRight}</span>}
    </>
  );

  // Hover/active handlers via inline events keep us out of CSS-in-JS land
  // while still giving us the lift+shadow feel.
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!isDisabled) e.currentTarget.style.transform = 'scale(0.98)';
  };
  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.style.transform = '';
  };
  const onMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (isDisabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.background = 'var(--accent-hover)';
      e.currentTarget.style.borderColor = 'var(--accent-hover)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.background = 'var(--surface-sunken)';
    } else if (variant === 'ghost') {
      e.currentTarget.style.background = 'var(--accent-muted)';
    }
    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
  };
  const onMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    if (isDisabled) return;
    Object.assign(e.currentTarget.style, vs);
    e.currentTarget.style.boxShadow = '';
  };

  if (as === 'a') {
    return (
      <a
        {...(rest as unknown as AnchorHTMLAttributes<HTMLAnchorElement>)}
        style={baseStyle}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        aria-disabled={isDisabled}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      {...(rest as unknown as ButtonHTMLAttributes<HTMLButtonElement>)}
      disabled={isDisabled}
      style={baseStyle}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {content}
    </button>
  );
}
