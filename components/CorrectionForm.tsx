'use client';

// Modal correction form. Replaces the legacy inline form that lived
// inside the old GymCard. Used both from the new GymCard's "Wrong info?"
// link AND from the /gym/[gymId] page's "Report wrong info" footer link.
//
// Submission rules (carried over from the legacy form):
//   - Description (`field`) is always required
//   - At least ONE of `correct_val` or `instagram` must be filled
//   - `correct_val` only → posts a single correction record
//   - `correct_val` + `instagram` → posts two records (main + ig)
//   - `instagram` only → posts a single `field: 'instagram'` record
//
// On success, shows a brief "Thanks!" state for 1.4s then closes.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Gym } from '@/lib/types';
import { Button } from './ui';

interface Props {
  gym: Gym;
  onClose: () => void;
}

export default function CorrectionForm({ gym, onClose }: Props) {
  const [field, setField] = useState('');
  const [correctVal, setCorrectVal] = useState('');
  const [instagram, setInstagram] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') setPortal(document.body);
  }, []);

  // Lock body scroll while open + close on Esc.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const canSubmit =
    field.trim().length > 0 &&
    (correctVal.trim().length > 0 || instagram.trim().length > 0) &&
    !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const desc = field.trim();
    const val = correctVal.trim();
    const ig = instagram.trim();

    setSubmitting(true);
    setError(null);
    try {
      const requests: Promise<Response>[] = [];

      // Main correction record — only when there's a corrected value.
      if (val) {
        requests.push(fetch('/api/corrections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gym_id: gym.id,
            gym_name: gym.name,
            gym_city: gym.city,
            field: desc.slice(0, 200),
            current_val: '',
            correct_val: val,
            notes: notes.trim() || null,
          }),
        }));
      }

      // Instagram record — separate so the API can route / dedupe IG
      // updates independently.
      if (ig) {
        requests.push(fetch('/api/corrections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gym_id: gym.id,
            gym_name: gym.name,
            gym_city: gym.city,
            field: 'instagram',
            current_val: gym.instagram ?? '',
            correct_val: ig,
            // For IG-only submissions, fold the description into notes
            // so the reviewer keeps context.
            notes: val ? null : (desc + (notes.trim() ? `\n\n${notes.trim()}` : '')),
          }),
        }));
      }

      const results = await Promise.all(requests);
      const allOk = results.every(r => r.ok);
      if (!allOk) throw new Error('Submission failed');

      setSubmitted(true);
      // Clear the form for any follow-up corrections, then auto-close.
      setField('');
      setCorrectVal('');
      setInstagram('');
      setNotes('');
      setTimeout(() => { onClose(); }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!portal) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    background: 'var(--surface-sunken)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontFamily: "'Inter Tight', sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 150ms',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 4,
    fontFamily: "'JetBrains Mono', monospace",
  };

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 20,
          width: '100%', maxWidth: 460,
          maxHeight: '90dvh', overflowY: 'auto',
          boxShadow: 'var(--shadow-xl)',
          fontFamily: "'Inter Tight', sans-serif",
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--bone)' }}>
              Report wrong info
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {gym.name}{gym.city ? ` · ${gym.city}` : ''}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            style={{ height: 28, minWidth: 28, padding: '0 6px', fontSize: 18, fontWeight: 400, flexShrink: 0 }}
          >
            ×
          </Button>
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>👑</div>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>
              Thanks!
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Your correction will be reviewed by an admin.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            {/* Description — required */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>What's wrong?</label>
              <textarea
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="e.g. Phone number is outdated"
                rows={2}
                required
                style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
              />
            </div>

            {/* Correct value */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Correct value</label>
              <input
                type="text"
                value={correctVal}
                onChange={(e) => setCorrectVal(e.target.value)}
                placeholder="What should it be?"
                style={inputStyle}
              />
            </div>

            {/* Instagram — optional, separate field */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Instagram (optional)</label>
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder={gym.instagram ? `Currently: ${gym.instagram}` : '@handle or instagram.com/...'}
                style={inputStyle}
              />
            </div>

            {/* Notes — optional */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything else the reviewer should know?"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {error && (
              <div style={{
                padding: '8px 12px', marginBottom: 12,
                background: 'rgba(196,53,46,0.10)',
                border: '1px solid rgba(196,53,46,0.30)',
                color: 'var(--danger)',
                fontSize: 12,
                borderRadius: 'var(--radius-md)',
              }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={!canSubmit}
                loading={submitting}
              >
                {submitting ? 'Sending…' : 'Submit correction'}
              </Button>
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Need both a correction and an Instagram update? Fill in both fields — they're submitted separately.
            </p>
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(modal, portal);
}
