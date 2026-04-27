'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

export default function Header() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const { user, signOut, requireAuth } = useAuth();

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const t = saved ?? preferred;
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  };

  return (
    <header style={{
      background: 'var(--surface-raised)',
      borderBottom: '1px solid var(--border)',
      padding: '0 20px',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: 'var(--shadow-sm)',
      flexShrink: 0,
      zIndex: 100,
      position: 'relative',
    }}>
      {/* Logo */}
      <Link href="/" style={{
        fontFamily: "'Archivo Black', sans-serif",
        fontSize: 18,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
        textDecoration: 'none',
      }}>
        MatFinder
      </Link>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link
          href="/add-gym"
          style={{
            fontFamily: "'Inter Tight', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            padding: '5px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            transition: 'all 0.15s',
          }}
        >
          Add Gym
        </Link>
        <Link
          href="/privacy"
          style={{
            fontFamily: "'Inter Tight', sans-serif",
            fontSize: 12,
            color: 'var(--text-muted)',
            textDecoration: 'none',
            padding: '5px 8px',
          }}
        >
          Privacy
        </Link>
        <Link
          href="/terms"
          style={{
            fontFamily: "'Inter Tight', sans-serif",
            fontSize: 12,
            color: 'var(--text-muted)',
            textDecoration: 'none',
            padding: '5px 8px',
          }}
        >
          Terms
        </Link>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link
              href="/account"
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'var(--accent)', color: '#000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              {(user.email?.[0] ?? '?').toUpperCase()}
            </Link>
            <button
              onClick={signOut}
              style={{
                fontFamily: "'Inter Tight', sans-serif",
                fontSize: 12, color: 'var(--text-muted)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '5px 6px',
              }}
            >Sign out</button>
          </div>
        ) : (
          <button
            onClick={() => requireAuth(() => {})}
            style={{
              fontFamily: "'Inter Tight', sans-serif",
              fontSize: 13, fontWeight: 600,
              color: 'var(--text-primary)',
              background: 'var(--accent)',
              border: 'none', borderRadius: 'var(--radius-md)',
              padding: '5px 12px', cursor: 'pointer',
            }}
          >Sign in</button>
        )}
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          style={{
            width: 34,
            height: 34,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
          }}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </header>
  );
}
