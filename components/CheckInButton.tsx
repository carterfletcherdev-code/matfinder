'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

interface CheckInButtonProps {
  gymId: string;
  gymName: string;
}

export default function CheckInButton({ gymId, gymName }: CheckInButtonProps) {
  const { user, requireAuth } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');

  const open = () => requireAuth(() => setShowModal(true));
  const close = () => { setShowModal(false); setSessionName(''); setNote(''); setStatus('idle'); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setStatus('saving');
    await supabase.from('checkins').insert({
      user_id: user.id,
      gym_id: gymId,
      gym_name: gymName,
      session_name: sessionName.trim() || null,
      note: note.trim() || null,
    });
    setStatus('done');
    setTimeout(close, 1200);
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        style={{
          fontFamily: "'Inter Tight', sans-serif",
          fontSize: 12, fontWeight: 600,
          color: 'var(--text-secondary)',
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 10px',
          cursor: 'pointer',
        }}
      >
        ✓ Check in
      </button>

      {showModal && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg)', color: 'var(--fg)',
              border: '1px solid var(--border)', borderRadius: 12,
              padding: 24, width: '100%', maxWidth: 380,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>Check in at {gymName}</h2>
              <button onClick={close} style={{ background: 'none', border: 'none', color: 'var(--fg)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            {status === 'done' ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--accent)' }}>✓ Checked in!</p>
            ) : (
              <form onSubmit={submit}>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Session name (e.g. Saturday open mat)"
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 13,
                    background: 'var(--bg-elev)', color: 'var(--fg)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    marginBottom: 8, boxSizing: 'border-box',
                    fontFamily: "'Inter Tight', sans-serif",
                  }}
                />
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Notes… (who you rolled with, what you worked on, etc.)"
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 13,
                    background: 'var(--bg-elev)', color: 'var(--fg)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    marginBottom: 12, boxSizing: 'border-box', resize: 'vertical',
                    fontFamily: "'Inter Tight', sans-serif",
                  }}
                />
                <button
                  type="submit"
                  disabled={status === 'saving'}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 14, fontWeight: 700,
                    background: 'var(--accent)', color: '#000', border: 'none',
                    borderRadius: 8, cursor: status === 'saving' ? 'wait' : 'pointer',
                    opacity: status === 'saving' ? 0.6 : 1,
                  }}
                >
                  {status === 'saving' ? 'Saving…' : 'Check in'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
