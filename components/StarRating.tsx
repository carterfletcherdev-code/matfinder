'use client';

import { useState, useEffect, useCallback } from 'react';

interface StarRatingProps {
  gymId: string;
  isSelected: boolean;
}

interface RatingData {
  avg: number | null;
  count: number;
  userRating: number | null;
}

export default function StarRating({ gymId, isSelected }: StarRatingProps) {
  const [data, setData] = useState<RatingData>({ avg: null, count: 0, userRating: null });
  const [hover, setHover] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Track what the user already rated this session (localStorage)
  const storageKey = `rating_${gymId}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ratings?gym_id=${gymId}`);
      const json = await res.json();
      const saved = parseInt(localStorage.getItem(storageKey) ?? '0') || null;
      setData({ ...json, userRating: saved });
    } catch { /* silent fail */ }
  }, [gymId, storageKey]);

  useEffect(() => {
    if (isSelected) load();
  }, [isSelected, load]);

  async function rate(score: number) {
    setSubmitting(true);
    try {
      await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gym_id: gymId, score, comment: comment || undefined }),
      });
      localStorage.setItem(storageKey, String(score));
      setData(prev => ({ ...prev, userRating: score }));
      setSubmitted(true);
      await load();
    } catch { /* silent */ }
    setSubmitting(false);
  }

  if (!isSelected) return null;

  const displayScore = hover || data.userRating || 0;
  const avgDisplay = data.avg ? data.avg.toFixed(1) : null;

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--brown-100)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: showComment ? 8 : 0,
      }}>
        {/* Stars */}
        <div style={{ display: 'flex', gap: 2 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              disabled={submitting}
              onClick={() => {
                if (!submitted) {
                  setShowComment(true);
                  setData(prev => ({ ...prev, userRating: n }));
                }
              }}
              onMouseEnter={() => !submitted && setHover(n)}
              onMouseLeave={() => setHover(0)}
              style={{
                background: 'none', border: 'none', cursor: submitted ? 'default' : 'pointer',
                padding: 0, fontSize: 16, lineHeight: 1,
                color: n <= displayScore ? '#F59E0B' : 'var(--border)',
                transition: 'color 0.1s',
              }}
            >
              ★
            </button>
          ))}
        </div>

        {avgDisplay && (
          <span style={{
            fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-muted)',
          }}>
            {avgDisplay} ({data.count})
          </span>
        )}

        {submitted && (
          <span style={{
            fontSize: 11, color: '#5E8B5E',
            fontFamily: "'Inter Tight', sans-serif", fontStyle: 'italic',
          }}>
            Thanks for rating!
          </span>
        )}
      </div>

      {/* Optional comment box */}
      {showComment && !submitted && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Leave a quick note (optional)"
            style={{
              flex: 1, fontSize: 11,
              padding: '4px 8px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--brown-200)',
              background: 'var(--surface-raised)',
              color: 'var(--text-primary)',
              fontFamily: "'Inter Tight', sans-serif",
              outline: 'none',
            }}
          />
          <button
            type="button"
            disabled={submitting || !data.userRating}
            onClick={() => data.userRating && rate(data.userRating)}
            style={{
              fontSize: 11, fontWeight: 700, padding: '4px 10px',
              borderRadius: 'var(--radius-md)', border: 'none',
              background: 'var(--accent)', color: 'var(--bone)',
              cursor: 'pointer', fontFamily: "'Inter Tight', sans-serif",
            }}
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
