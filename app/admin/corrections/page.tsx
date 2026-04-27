'use client';

import { useState, useEffect, useCallback } from 'react';

interface Correction {
  id: string;
  gym_id: string;
  gym_name: string | null;
  gym_city: string | null;
  field: string;
  current_val: string | null;
  correct_val: string;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export default function AdminCorrectionsPage() {
  const [secret, setSecret] = useState('');
  const [authed, setAuthed] = useState(false);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const load = useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/corrections?secret=${encodeURIComponent(s)}`);
      if (res.status === 401) { setError('Wrong password'); setAuthed(false); return; }
      if (!res.ok) { setError('Failed to load'); return; }
      const data = await res.json();
      setCorrections(data);
      setAuthed(true);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  async function updateStatus(id: string, status: 'approved' | 'rejected') {
    const res = await fetch('/api/corrections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, secret }),
    });
    if (res.ok) {
      setCorrections(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    }
  }

  const visible = filter === 'all' ? corrections : corrections.filter(c => c.status === filter);
  const counts = {
    pending: corrections.filter(c => c.status === 'pending').length,
    approved: corrections.filter(c => c.status === 'approved').length,
    rejected: corrections.filter(c => c.status === 'rejected').length,
  };

  if (!authed) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--surface-sunken)', fontFamily: "'Inter Tight', sans-serif",
      }}>
        <div style={{
          background: 'var(--surface-base)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '32px 40px', width: 320,
          boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Admin access
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            MatFinder corrections queue
          </div>
          <input
            type="password"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(secret)}
            placeholder="Admin password"
            autoFocus
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--border)', background: 'var(--surface-raised)',
              color: 'var(--text-primary)', fontSize: 14,
              fontFamily: "'Inter Tight', sans-serif", outline: 'none', marginBottom: 12,
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 10 }}>{error}</div>
          )}
          <button
            onClick={() => load(secret)}
            disabled={loading || !secret}
            style={{
              width: '100%', padding: '8px', borderRadius: 'var(--radius-md)',
              border: 'none', background: 'var(--accent)', color: 'var(--bone)',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              fontFamily: "'Inter Tight', sans-serif",
            }}
          >
            {loading ? 'Loading…' : 'Enter'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--surface-sunken)',
      fontFamily: "'Inter Tight', sans-serif", padding: '32px 24px',
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            Corrections queue
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {counts.pending} pending · {counts.approved} approved · {counts.rejected} rejected
          </span>
          <button
            onClick={() => load(secret)}
            style={{
              marginLeft: 'auto', padding: '4px 12px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
              fontFamily: "'Inter Tight', sans-serif",
            }}
          >
            Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '4px 14px', borderRadius: 'var(--radius-full)',
                border: `1.5px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
                background: filter === f ? 'var(--accent-muted)' : 'transparent',
                color: filter === f ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Inter Tight', sans-serif",
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && <span style={{ marginLeft: 5, opacity: 0.7 }}>{counts[f]}</span>}
            </button>
          ))}
        </div>

        {/* List */}
        {visible.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No {filter === 'all' ? '' : filter} corrections
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(c => (
              <div key={c.id} style={{
                background: 'var(--surface-base)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', padding: '16px 18px',
                borderLeft: `4px solid ${c.status === 'pending' ? 'var(--accent)' : c.status === 'approved' ? '#16A34A' : '#DC2626'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {c.gym_name ?? c.gym_id}
                      {c.gym_city && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}> · {c.gym_city}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                        background: 'var(--surface-sunken)', color: 'var(--text-muted)',
                        padding: '1px 7px', borderRadius: 4,
                      }}>
                        {c.field}
                      </span>
                      {c.current_val && (
                        <>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.current_val}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
                        </>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.correct_val}</span>
                    </div>
                    {c.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        "{c.notes}"
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {c.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => updateStatus(c.id, 'approved')}
                        style={{
                          padding: '5px 14px', borderRadius: 'var(--radius-md)',
                          border: 'none', background: '#16A34A', color: '#fff',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          fontFamily: "'Inter Tight', sans-serif",
                        }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => updateStatus(c.id, 'rejected')}
                        style={{
                          padding: '5px 14px', borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          fontFamily: "'Inter Tight', sans-serif",
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {c.status !== 'pending' && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px',
                      borderRadius: 'var(--radius-full)',
                      background: c.status === 'approved' ? '#DCFCE7' : '#FEE2E2',
                      color: c.status === 'approved' ? '#166534' : '#991B1B',
                    }}>
                      {c.status.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
