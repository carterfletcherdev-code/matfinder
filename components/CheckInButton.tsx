'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { Button } from './ui';

interface CheckInButtonProps {
  gymId: string;
  gymName: string;
  /** Compact rendering for the landscape compact-expanded card. */
  compact?: boolean;
  /** New Card-A variant — full-width primary 48px button. */
  variant?: 'default' | 'primary-big';
}

export default function CheckInButton({ gymId, gymName, compact, variant }: CheckInButtonProps) {
  const { user, requireAuth } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Portal target — escapes any backdrop-filter/transform containing-block
  // traps so the modal can fill the viewport like the Full Schedule modal.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalTarget(document.body); }, []);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!showModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [showModal]);

  const open = (e: React.MouseEvent) => {
    // CRITICAL: stop bubbling to the parent gym card's onClick — without
    // this, the card collapses, unmounting the action row + this modal
    // before it can render. (Desktop list-side bug fix.)
    e.stopPropagation();
    requireAuth(() => setShowModal(true));
  };
  const close = () => { setShowModal(false); setSessionName(''); setNote(''); setStatus('idle'); setErrorMsg(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setStatus('saving');
    setErrorMsg(null);
    const { error } = await supabase.from('checkins').insert({
      user_id: user.id,
      gym_id: gymId,
      gym_name: gymName,
      session_name: sessionName.trim() || null,
      note: note.trim() || null,
    });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message || 'Failed to check in. Please try again.');
      return;
    }
    setStatus('done');
    setTimeout(close, 1200);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    fontSize: 14,
    background: 'var(--surface-base)',
    color: 'var(--text-primary)',
    border: '1.5px solid var(--bone)',
    borderRadius: 'var(--radius-md)',
    boxSizing: 'border-box',
    fontFamily: "'Inter Tight', sans-serif",
    outline: 'none',
  };

  const modal = showModal && (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0,
        // Matches the matfinder header pill / sort tabs (Popular ·
        // Nearest · Featured) — same translucent dark brown so the
        // takeover reads as part of the same visual system.
        background: 'rgba(26,19,16,0.88)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
        padding: '5vh 5vw',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90vw', height: '90vh', maxWidth: 1200,
          background: 'var(--bg)', color: 'var(--fg)',
          border: '1.5px solid var(--bone)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Sticky header — gym name left, bone-outlined Back button right. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16,
          padding: '20px 28px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              color: 'var(--muted)', textTransform: 'uppercase',
              marginBottom: 4,
            }}>Check in at</div>
            <h2 style={{
              margin: 0, fontSize: 22, fontWeight: 800,
              fontFamily: "'Inter Tight', sans-serif",
              color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{gymName}</h2>
          </div>
          <button
            onClick={close}
            style={{
              background: 'transparent',
              border: '1.5px solid var(--bone)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: 13, color: 'var(--text-primary)', fontWeight: 700,
              fontFamily: "'Inter Tight', sans-serif",
              padding: '6px 14px',
              flexShrink: 0,
            }}
          >Back</button>
        </div>

        {/* Body — scrollable. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            {status === 'done' ? (
              <div style={{
                padding: '32px 24px', textAlign: 'center',
                border: '1.5px solid var(--bone)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-base)',
              }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
                <div style={{
                  fontSize: 18, fontWeight: 700,
                  fontFamily: "'Inter Tight', sans-serif",
                  color: 'var(--text-primary)',
                }}>Checked in!</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  Your session has been logged.
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
                {errorMsg && (
                  <div style={{
                    marginBottom: 16, padding: '12px 14px',
                    background: 'rgba(196,53,46,0.12)',
                    border: '1.5px solid rgba(196,53,46,0.40)',
                    borderRadius: 'var(--radius-md)', fontSize: 13, color: '#C4352E',
                    fontFamily: "'Inter Tight', sans-serif",
                  }}>{errorMsg}</div>
                )}

                <label style={{
                  display: 'block', marginBottom: 18,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    color: 'var(--muted)', textTransform: 'uppercase',
                    marginBottom: 6,
                  }}>Session name</div>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="e.g. Saturday open mat"
                    style={inputStyle}
                  />
                </label>

                <label style={{
                  display: 'block', marginBottom: 24,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    color: 'var(--muted)', textTransform: 'uppercase',
                    marginBottom: 6,
                  }}>Notes</div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Who you rolled with, what you worked on, how it went…"
                    rows={6}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 140 }}
                  />
                </label>

                <button
                  type="submit"
                  disabled={status === 'saving'}
                  style={{
                    width: '100%', padding: '14px 18px',
                    fontSize: 14, fontWeight: 700, letterSpacing: '0.02em',
                    fontFamily: "'Inter Tight', sans-serif",
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: '1.5px solid var(--bone)',
                    borderRadius: 'var(--radius-md)',
                    cursor: status === 'saving' ? 'wait' : 'pointer',
                    opacity: status === 'saving' ? 0.6 : 1,
                  }}
                >
                  {status === 'saving' ? 'Saving…' : '✓ Check in'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Card-A variant: full-width primary 48px button. Used in the new
  // GymCard layout where Check in is the single big CTA below the
  // open-mat panel.
  if (variant === 'primary-big') {
    return (
      <>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={open}
          style={{ height: 48, fontWeight: 700, marginBottom: 8 }}
        >
          Check in here
        </Button>
        {portalTarget && modal ? createPortal(modal, portalTarget) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        style={{
          fontFamily: "'Inter Tight', sans-serif",
          // Two sizes, both squared:
          //   compact → small (landscape compact-expanded card)
          //   default → medium (desktop & portrait full card footer row)
          fontSize: compact ? 10 : 11,
          fontWeight: 700,
          color: 'var(--bone)',
          background: 'transparent',
          border: '1.5px solid var(--bone)',
          borderRadius: 'var(--radius-md)',
          padding: compact ? '3px 9px' : '4px 10px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          letterSpacing: '0.01em',
        }}
      >
        ✓ Check In
      </button>

      {portalTarget && modal ? createPortal(modal, portalTarget) : null}
    </>
  );
}
