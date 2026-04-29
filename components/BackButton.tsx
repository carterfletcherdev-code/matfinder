'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface BackButtonProps {
  /** URL to fall back to if there's no browser history (e.g. direct deep-link). */
  fallbackHref?: string;
  /** Optional inline style overrides. */
  style?: React.CSSProperties;
  /** Children — defaults to "← Back". */
  children?: React.ReactNode;
}

/**
 * Smart back button — prefers `router.back()` so navigating
 * /account → /privacy → Back lands you back on /account, but falls
 * back to a known URL when there's no history (direct link / refresh).
 */
export default function BackButton({
  fallbackHref = '/',
  style,
  children = '← Back',
}: BackButtonProps) {
  const router = useRouter();
  // Only consider history available after mount to avoid SSR hydration mismatches.
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(typeof window !== 'undefined' && window.history.length > 1);
  }, []);

  return (
    <button
      onClick={() => {
        if (canGoBack) router.back();
        else router.push(fallbackHref);
      }}
      style={{
        background: 'transparent',
        border: '1.5px solid var(--bone)',
        borderRadius: 'var(--radius-full)',
        color: 'var(--text-primary)',
        fontFamily: "'Inter Tight', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        padding: '6px 14px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
