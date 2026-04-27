'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useRatings } from './RatingsProvider';

interface StarRatingProps {
  gymId: string;
  isSelected: boolean;
  isMobile?: boolean;
  onRated?: () => void;
}

export default function StarRating({ gymId, isSelected, isMobile, onRated }: StarRatingProps) {
  const { session, requireAuth } = useAuth();
  const { aggregates, myRatings, submit, remove } = useRatings();

  const aggregate = aggregates[gymId];
  const savedScore = myRatings[gymId] ?? 0;

  const [draft, setDraft] = useState<number>(savedScore);
  const [hover, setHover] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [removing, setRemoving] = useState(false);

  // Keep draft in sync if context value changes (e.g., after sign-in loads ratings).
  useEffect(() => { setDraft(savedScore); }, [savedScore, gymId]);

  if (!isSelected) return null;

  const displayScore = hover || draft || 0;
  const avgDisplay = aggregate ? aggregate.avg.toFixed(1) : null;
  const dirty = draft > 0 && draft !== savedScore;

  const onPick = (e: React.MouseEvent, score: number) => {
    e.stopPropagation();
    if (!session?.user) { requireAuth(() => setDraft(score)); return; }
    setDraft(score);
    setErrMsg('');
  };

  const onSubmit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session?.user) { requireAuth(() => {}); return; }
    if (!dirty || submitting) return;
    setSubmitting(true);
    const res = await submit(gymId, draft);
    setSubmitting(false);
    if (!res.ok) { setErrMsg(res.error || 'Could not save'); return; }
    setShowCheck(true);
    setTimeout(() => setShowCheck(false), 1400);
    onRated?.();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        marginTop: isMobile ? 7 : 10, paddingTop: isMobile ? 7 : 10,
        borderTop: '1px solid rgba(245,241,232,0.20)',
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: isMobile ? 6 : 8,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={(e) => onPick(e, n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: isMobile ? '0 1px' : 0, fontSize: isMobile ? 14 : 16, lineHeight: 1,
              color: n <= displayScore ? '#F59E0B' : 'rgba(245,241,232,0.30)',
              transition: 'color 0.1s, transform 0.15s',
            }}
          >★</button>
        ))}
      </div>

      {dirty && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          style={{
            background: '#F59E0B', color: '#1A1310', border: 'none', borderRadius: 4,
            padding: isMobile ? '2px 8px' : '3px 10px',
            fontSize: 11, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.6 : 1,
            fontFamily: "'Inter Tight', sans-serif",
          }}
        >{submitting ? 'Saving…' : (savedScore ? 'Update' : 'Submit')}</button>
      )}

      {savedScore > 0 && !dirty && (
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            setRemoving(true);
            await remove(gymId);
            setDraft(0);
            setRemoving(false);
            onRated?.();
          }}
          disabled={removing}
          title="Remove your rating"
          style={{
            background: 'none', border: 'none', cursor: removing ? 'wait' : 'pointer',
            fontSize: 10, color: 'rgba(245,241,232,0.35)', padding: '2px 4px',
            fontFamily: "'Inter Tight', sans-serif",
          }}
        >{removing ? '…' : '✕ Remove rating'}</button>
      )}

      {avgDisplay && (
        <span style={{
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          color: 'rgba(245,241,232,0.65)',
        }}>
          {avgDisplay} ({aggregate!.count})
        </span>
      )}

      {!session?.user && (
        <span style={{ fontSize: 10, color: 'rgba(245,241,232,0.45)' }}>
          Sign in to rate
        </span>
      )}

      {showCheck && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, color: '#A8C2A8',
          fontFamily: "'Inter Tight', sans-serif", fontWeight: 700,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, borderRadius: '50%',
            background: '#A8C2A8', color: '#1A1310',
            fontSize: 10, fontWeight: 900, lineHeight: 1,
          }}>✓</span>
          Saved
        </span>
      )}

      {errMsg && (
        <span style={{ fontSize: 10, color: '#ff6b6b' }}>{errMsg}</span>
      )}
    </div>
  );
}
