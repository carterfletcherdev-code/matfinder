'use client';

import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from './ui';

export function SignInModal() {
  const { showSignInModal, setShowSignInModal, signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!showSignInModal) return null;

  const close = () => {
    setShowSignInModal(false);
    setTimeout(() => { setEmail(''); setStatus('idle'); setErrorMsg(''); }, 200);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    const res = await signInWithEmail(email.trim());
    if (res.ok) setStatus('sent');
    else { setStatus('error'); setErrorMsg(res.error || 'Could not send link'); }
  };

  return (
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
          background: 'rgba(20,13,9,0.98)', color: 'var(--bone)',
          border: '1px solid rgba(245,241,232,0.15)', borderRadius: 12,
          padding: 24, width: '100%', maxWidth: 380,
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--bone)', fontFamily: "'Inter Tight', sans-serif", fontWeight: 800 }}>Sign in</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={close}
            aria-label="Close"
            style={{
              color: 'var(--bone)',
              padding: '0 6px',
              fontSize: 20,
              fontWeight: 400,
              height: 28,
              minWidth: 28,
            }}
          >×</Button>
        </div>

        {status === 'sent' ? (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 14 }}>Check your email.</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              We sent a sign-in link to <strong>{email}</strong>. Click it to finish signing in.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <button
              type="button"
              onClick={signInWithGoogle}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14, fontWeight: 600,
                background: '#fff', color: '#111', border: '1px solid #ddd',
                borderRadius: 8, cursor: 'pointer', marginBottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-3.59-13.46-8.66l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgba(245,241,232,0.55)', fontFamily: "'Inter Tight', sans-serif" }}>
              Enter your email — we&apos;ll send you a one-time sign-in link. No password needed.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 16,
                background: 'rgba(255,255,255,0.06)', color: 'var(--bone)',
                border: '1px solid rgba(245,241,232,0.2)', borderRadius: 8,
                marginBottom: 12, boxSizing: 'border-box', outline: 'none',
              }}
            />
            {status === 'error' && (
              <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 8 }}>{errorMsg}</div>
            )}
            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              loading={status === 'sending'}
              disabled={status === 'sending'}
            >
              {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
