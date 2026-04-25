'use client';

import { useState, useEffect } from 'react';

export default function Header() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30,
          height: 30,
          background: 'var(--accent)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          flexShrink: 0,
        }}>
          🥋
        </div>
        <div>
          <span style={{
            fontFamily: "'Archivo Black', sans-serif",
            fontSize: 18,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}>
            MatFinder
          </span>
          <span style={{
            fontFamily: "'Instrument Serif', serif",
            fontStyle: 'italic',
            fontSize: 13,
            color: 'var(--text-muted)',
            marginLeft: 6,
          }}>
            open mats, everywhere.
          </span>
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <a
          href="https://github.com/carterfletcherdev-code"
          target="_blank"
          rel="noopener noreferrer"
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
          Add your gym →
        </a>
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
