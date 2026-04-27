'use client';

import { useState } from 'react';

interface VerifiedBadgeProps {
  sourceUrl?: string;
  sourceQuote?: string;
  verifiedAt?: string;
  size?: 'sm' | 'md';
}

export default function VerifiedBadge({ sourceUrl, sourceQuote, verifiedAt, size = 'sm' }: VerifiedBadgeProps) {
  const [open, setOpen] = useState(false);

  const onToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(o => !o);
  };

  const px = size === 'md' ? '3px 8px' : '1px 6px';
  const fontSize = size === 'md' ? 11 : 10;

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={onToggle}
        title="Click for source"
        style={{
          background: 'rgba(168,194,168,0.18)',
          color: '#A8C2A8',
          fontSize, fontWeight: 700,
          padding: px,
          borderRadius: 999,
          border: '1px solid rgba(168,194,168,0.4)',
          cursor: 'help',
          fontFamily: "'Inter Tight', sans-serif",
          letterSpacing: '0.02em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          lineHeight: 1.2,
        }}
      >
        <span style={{ fontSize: fontSize - 1 }}>✓</span>
        Verified
      </button>

      {open && sourceQuote && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)', left: 0,
            zIndex: 50,
            background: 'rgba(28,20,14,0.98)',
            border: '1px solid rgba(168,194,168,0.4)',
            borderRadius: 8,
            padding: '8px 10px',
            width: 280, maxWidth: '85vw',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontSize: 11,
            fontFamily: "'Inter Tight', sans-serif",
            color: 'rgba(245,241,232,0.95)',
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontWeight: 700, color: '#A8C2A8', marginBottom: 4, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Source quote
          </div>
          <div style={{ fontStyle: 'italic', marginBottom: 6 }}>
            “{sourceQuote}”
          </div>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                color: '#A8C2A8',
                fontSize: 10,
                textDecoration: 'underline',
              }}
            >
              View source →
            </a>
          )}
          {verifiedAt && (
            <div style={{ fontSize: 9, color: 'rgba(245,241,232,0.5)', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
              {new Date(verifiedAt).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
