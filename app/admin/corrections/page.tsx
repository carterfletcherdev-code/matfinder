'use client';

// Admin · Corrections moderation queue.
//
// Replaces the old password-secret admin page with a proper account-based
// flow: a user must be present in public.admins to see this page. RLS on
// the corrections table enforces the same gate server-side, so even
// crafted requests can't bypass the UI check.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { supabase, supabaseEnabled } from '@/lib/supabase';
import { useIsAdmin } from '@/lib/useIsAdmin';

interface AdminStats {
  total_accounts: number;
  active_users_30d: number;
  subscriptions_total: number;
  subscriptions_monthly: number;
  subscriptions_annual: number;
  monthly_revenue_cents: number;
  annual_revenue_cents: number;
  subscribers: Array<{
    email: string;
    interval: 'month' | 'year' | 'unknown';
    amount_cents: number;
    started_at: string;
    status: string;
  }>;
  users: Array<{
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
  }>;
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Correction {
  id: number;
  gym_id: string;
  gym_name: string;
  gym_city: string | null;
  field: string;
  current_val: string | null;
  correct_val: string;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

export default function AdminCorrectionsPage() {
  const { user, loading: authLoading, requireAuth } = useAuth();
  const isAdmin = useIsAdmin();
  const [rows, setRows] = useState<Correction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [showSubscribers, setShowSubscribers] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [emailQuery, setEmailQuery] = useState('');

  // Pull the auth token so we can call /api/admin/stats with it.
  async function loadStats() {
    if (!supabaseEnabled) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  }
  useEffect(() => { if (isAdmin) loadStats(); }, [isAdmin]);

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from('corrections')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setRows((data ?? []) as Correction[]);
    setLoading(false);
  }
  useEffect(() => { if (isAdmin) reload(); }, [isAdmin]);

  // Approve = mark the correction as approved AND, when the field maps
  // cleanly to a column on gym_overrides (instagram / website / phone),
  // upsert the new value so the public-facing card picks it up on the
  // next /api/gyms read (≤ 30s with the edge cache).
  // Reject = just mark as rejected — no data merge.
  async function setStatus(id: number, next: 'approved' | 'rejected') {
    setBusyIds(prev => new Set(prev).add(id));
    const row = rows?.find(r => r.id === id);
    await supabase.from('corrections').update({ status: next }).eq('id', id);

    if (next === 'approved' && row) {
      const fieldKey = normalizeFieldName(row.field);
      if (fieldKey) {
        await supabase
          .from('gym_overrides')
          .upsert({
            gym_id: row.gym_id,
            [fieldKey]: row.correct_val,
            updated_at: new Date().toISOString(),
          });
      }
    }

    setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setRows(prev => prev ? prev.map(r => r.id === id ? { ...r, status: next } : r) : prev);
  }

  // Map free-text correction "field" labels onto a gym_overrides column.
  // Returns null when the correction can't be auto-applied (e.g. schedule
  // changes, drop-in cost) and needs manual review.
  function normalizeFieldName(field: string): 'instagram' | 'website' | 'phone' | null {
    const f = field.toLowerCase();
    if (f === 'instagram' || f.includes('insta') || f.includes('@')) return 'instagram';
    if (f === 'website' || f.includes('website') || f.includes('url') || f.includes('site')) return 'website';
    if (f === 'phone' || f.includes('phone') || f.includes('tel')) return 'phone';
    return null;
  }

  async function deleteRow(id: number) {
    if (!confirm('Permanently delete this correction?')) return;
    setBusyIds(prev => new Set(prev).add(id));
    await supabase.from('corrections').delete().eq('id', id);
    setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setRows(prev => prev ? prev.filter(r => r.id !== id) : prev);
  }

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (statusFilter === 'all') return rows;
    return rows.filter(r => r.status === statusFilter);
  }, [rows, statusFilter]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, all: 0 };
    for (const r of rows ?? []) {
      c[r.status as 'pending' | 'approved' | 'rejected']++;
      c.all++;
    }
    return c;
  }, [rows]);

  if (authLoading) return <Centered>Checking access…</Centered>;
  if (!user) {
    return (
      <Centered>
        <p style={{ marginBottom: 14 }}>Sign in to access the admin console.</p>
        <button onClick={() => requireAuth(() => {})} style={pillStyle()}>Sign in</button>
      </Centered>
    );
  }
  if (!isAdmin) {
    return (
      <Centered>
        <p style={{ marginBottom: 6 }}>This area is for site admins only.</p>
        <Link href="/" style={pillStyle()}>Back to Map</Link>
      </Centered>
    );
  }

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', color: 'var(--bone)',
      fontFamily: "'Inter Tight', sans-serif",
      padding: '72px 16px 48px', overflowY: 'auto', position: 'relative',
    }}>
      <Link
        href="/"
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 1000,
          display: 'inline-flex', alignItems: 'center',
          padding: '8px 16px',
          background: 'var(--surface-base)',
          border: '1.5px solid var(--bone)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--bone)',
          fontSize: 13, fontWeight: 700,
          textDecoration: 'none',
          boxShadow: 'var(--shadow-md)',
        }}
      >Back to Map</Link>

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.10em',
          color: '#C9A24A', textTransform: 'uppercase',
          fontFamily: "'JetBrains Mono', monospace",
          marginBottom: 4,
        }}>Admin · Developer console</div>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800 }}>Help Confirm corrections</h1>
        <p style={{
          margin: '0 0 20px', fontSize: 13,
          color: 'rgba(245,241,232,0.65)', lineHeight: 1.5, maxWidth: 720,
        }}>
          Submissions from the <b style={{ color: 'var(--bone)' }}>Help Confirm</b> form
          on every gym card. Approve, reject, or delete each one. Approving
          marks the record so you can audit later — the actual data merge
          (Instagram updates → <code style={{ color: '#C9A24A' }}>gym_overrides</code>;
          schedule corrections → manual review) is still done out of band
          for now.
        </p>

        {/* ── Stats panel ── */}
        {stats && (
          <div style={{
            border: '1.5px solid var(--bone)',
            borderRadius: 'var(--radius-md)',
            padding: '18px 20px',
            background: 'var(--surface-base, rgba(0,0,0,0.18))',
            marginBottom: 28,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.10em',
              color: '#C9A24A', textTransform: 'uppercase',
              fontFamily: "'JetBrains Mono', monospace",
              marginBottom: 14,
            }}>Site stats</div>

            {/* Top row: people */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10, marginBottom: 14,
            }}>
              <StatCell label="Active users · 30d" value={stats.active_users_30d.toLocaleString()} />
              <StatCell label="Total accounts" value={stats.total_accounts.toLocaleString()} />
              <StatCell label="Subscriptions" value={stats.subscriptions_total.toLocaleString()} />
              <StatCell label="Pro · Monthly" value={stats.subscriptions_monthly.toLocaleString()} accent="#C9A24A" />
              <StatCell label="Pro · Annual"  value={stats.subscriptions_annual.toLocaleString()}  accent="#C9A24A" />
            </div>

            {/* Bottom row: revenue */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
            }}>
              <StatCell
                label="Estimated MRR"
                value={fmtMoney(stats.monthly_revenue_cents)}
                accent="#7EC8A4"
                sublabel="Monthly recurring"
              />
              <StatCell
                label="Estimated ARR"
                value={fmtMoney(stats.annual_revenue_cents)}
                accent="#7EC8A4"
                sublabel="Annual run rate"
              />
            </div>

            {/* Email lists — hidden behind expanders so they don't dominate the page */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => setShowSubscribers(v => !v)}
                style={togglePill()}
              >
                {showSubscribers ? 'Hide' : 'Show'} subscribers ({stats.subscribers.length})
              </button>
              <button
                onClick={() => setShowUsers(v => !v)}
                style={togglePill()}
              >
                {showUsers ? 'Hide' : 'Show'} all users ({stats.users.length})
              </button>
              {/* Email search — filters BOTH the subscribers and users
                  lists when expanded. Empty string = no filter. */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0, flex: '1 1 200px', minWidth: 180 }}>
                <input
                  type="search"
                  value={emailQuery}
                  onChange={(e) => setEmailQuery(e.target.value)}
                  placeholder="Search users by email…"
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-full)',
                    border: '1.5px solid rgba(245,241,232,0.30)',
                    background: 'rgba(0,0,0,0.30)',
                    color: 'var(--bone)',
                    fontSize: 12,
                    fontFamily: "'Inter Tight', sans-serif",
                    outline: 'none',
                  }}
                />
                {emailQuery && (
                  <button
                    onClick={() => setEmailQuery('')}
                    title="Clear search"
                    style={{
                      marginLeft: 4,
                      background: 'transparent', border: 'none',
                      color: 'rgba(245,241,232,0.55)', cursor: 'pointer',
                      fontSize: 14, padding: '4px 6px',
                    }}
                  >×</button>
                )}
              </div>
              <button
                onClick={loadStats}
                style={{ ...togglePill(), marginLeft: 'auto' }}
              >Refresh stats</button>
            </div>

            {/* Subscribers list */}
            {showSubscribers && (
              <div style={{ marginTop: 14, maxHeight: 360, overflowY: 'auto', border: '1px solid rgba(245,241,232,0.15)', borderRadius: 'var(--radius-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(245,241,232,0.05)' }}>
                      <th style={th}>Email</th>
                      <th style={th}>Plan</th>
                      <th style={th}>Amount</th>
                      <th style={th}>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const q = emailQuery.trim().toLowerCase();
                      const filtered = q
                        ? stats.subscribers.filter(s => s.email.toLowerCase().includes(q))
                        : stats.subscribers;
                      if (filtered.length === 0) {
                        return (
                          <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: 'rgba(245,241,232,0.55)', padding: 18 }}>
                            {q ? 'No subscribers match that email.' : 'No active subscribers yet.'}
                          </td></tr>
                        );
                      }
                      return filtered.map(s => (
                        <tr key={s.email + s.started_at}>
                          <td style={td}>
                            <a href={`mailto:${s.email}`} style={{ color: 'var(--bone)' }}>{s.email || <em style={{ opacity: 0.5 }}>no email</em>}</a>
                          </td>
                          <td style={{ ...td, textTransform: 'capitalize' }}>{s.interval}</td>
                          <td style={td}>{fmtMoney(s.amount_cents)}</td>
                          <td style={td}>{fmtDate(s.started_at)}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}

            {/* Users list */}
            {showUsers && (
              <div style={{ marginTop: 14, maxHeight: 360, overflowY: 'auto', border: '1px solid rgba(245,241,232,0.15)', borderRadius: 'var(--radius-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(245,241,232,0.05)' }}>
                      <th style={th}>Email</th>
                      <th style={th}>Created</th>
                      <th style={th}>Last sign-in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const q = emailQuery.trim().toLowerCase();
                      const filtered = q
                        ? stats.users.filter(u => u.email.toLowerCase().includes(q))
                        : stats.users;
                      if (filtered.length === 0) {
                        return (
                          <tr><td colSpan={3} style={{ ...td, textAlign: 'center', color: 'rgba(245,241,232,0.55)', padding: 18 }}>
                            {q ? 'No users match that email.' : 'No users yet.'}
                          </td></tr>
                        );
                      }
                      return filtered.map(u => (
                        <tr key={u.email + u.created_at}>
                          <td style={td}>
                            <a href={`mailto:${u.email}`} style={{ color: 'var(--bone)' }}>{u.email || <em style={{ opacity: 0.5 }}>no email</em>}</a>
                          </td>
                          <td style={td}>{fmtDate(u.created_at)}</td>
                          <td style={td}>{fmtDate(u.last_sign_in_at)}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map(k => {
            const active = statusFilter === k;
            return (
              <button
                key={k}
                onClick={() => setStatusFilter(k)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-full)',
                  border: `1.5px solid ${active ? 'var(--bone)' : 'rgba(245,241,232,0.30)'}`,
                  background: active ? 'var(--surface-base)' : 'transparent',
                  color: active ? 'var(--bone)' : 'rgba(245,241,232,0.85)',
                  fontFamily: "'Inter Tight', sans-serif",
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  letterSpacing: '0.02em',
                }}
              >
                {k === 'all' ? 'All' : k.charAt(0).toUpperCase() + k.slice(1)}
                <span style={{ opacity: 0.6 }}>· {counts[k]}</span>
              </button>
            );
          })}
          <button
            onClick={reload}
            style={{
              marginLeft: 'auto',
              padding: '5px 12px',
              borderRadius: 'var(--radius-full)',
              border: '1.5px solid rgba(245,241,232,0.30)',
              background: 'transparent',
              color: 'rgba(245,241,232,0.85)',
              fontFamily: "'Inter Tight', sans-serif",
              fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >Refresh</button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(245,241,232,0.55)' }}>Loading…</p>
        ) : !filtered || filtered.length === 0 ? (
          <div style={{
            border: '1.5px dashed rgba(245,241,232,0.20)',
            borderRadius: 'var(--radius-md)',
            padding: '32px 20px', textAlign: 'center',
            color: 'rgba(245,241,232,0.55)',
          }}>
            No {statusFilter === 'all' ? '' : statusFilter} corrections.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(row => (
              <CorrectionCard
                key={row.id}
                row={row}
                busy={busyIds.has(row.id)}
                onApprove={() => setStatus(row.id, 'approved')}
                onReject={() => setStatus(row.id, 'rejected')}
                onDelete={() => deleteRow(row.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CorrectionCard({
  row, busy, onApprove, onReject, onDelete,
}: {
  row: Correction;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const date = new Date(row.created_at);
  const dateStr = date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
  const isInstagram = row.field === 'instagram';
  const statusColor =
    row.status === 'approved' ? '#7EC8A4' :
    row.status === 'rejected' ? '#E06060' :
    '#C9A24A';

  return (
    <div style={{
      border: '1.5px solid rgba(245,241,232,0.20)',
      borderRadius: 'var(--radius-md)',
      padding: '16px 18px',
      background: 'var(--surface-base, rgba(0,0,0,0.18))',
      display: 'flex', flexDirection: 'column', gap: 10,
      opacity: busy ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--bone)' }}>{row.gym_name}</span>
          {row.gym_city && (
            <span style={{
              fontSize: 11, color: 'rgba(245,241,232,0.55)',
              fontFamily: "'JetBrains Mono', monospace",
            }}>{row.gym_city}</span>
          )}
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.10em',
            color: statusColor, textTransform: 'uppercase',
            fontFamily: "'JetBrains Mono', monospace",
            border: `1.5px solid ${statusColor}`,
            borderRadius: 'var(--radius-full)',
            padding: '2px 8px',
          }}>{row.status}</span>
          {isInstagram && (
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.10em',
              color: '#E1306C', textTransform: 'uppercase',
              fontFamily: "'JetBrains Mono', monospace",
              border: '1.5px solid #E1306C',
              borderRadius: 'var(--radius-full)',
              padding: '2px 8px',
            }}>Instagram</span>
          )}
        </div>
        <span style={{
          fontSize: 11, color: 'rgba(245,241,232,0.55)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>{dateStr}</span>
      </div>

      {!isInstagram && (
        <div>
          <div style={miniLabel}>What needs correcting</div>
          <div style={valueBlock}>{row.field}</div>
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: row.current_val ? '1fr 1fr' : '1fr',
        gap: 10,
      }}>
        {row.current_val && (
          <div>
            <div style={miniLabel}>Current</div>
            <div style={{ ...valueBlock, color: 'rgba(245,241,232,0.55)' }}>{row.current_val}</div>
          </div>
        )}
        <div>
          <div style={miniLabel}>{isInstagram ? 'New Instagram' : 'Suggested correction'}</div>
          <div style={valueBlock}>{row.correct_val}</div>
        </div>
      </div>
      {row.notes && (
        <div>
          <div style={miniLabel}>Notes</div>
          <div style={{ ...valueBlock, color: 'rgba(245,241,232,0.75)' }}>{row.notes}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {row.status !== 'approved' && (
          <button onClick={onApprove} disabled={busy} style={actionPill('#7EC8A4')}>Approve</button>
        )}
        {row.status !== 'rejected' && (
          <button onClick={onReject} disabled={busy} style={actionPill('#E06060')}>Reject</button>
        )}
        <button onClick={onDelete} disabled={busy} style={{
          ...actionPill('rgba(245,241,232,0.55)'),
          marginLeft: 'auto',
        }}>Delete</button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', color: 'var(--bone)',
      fontFamily: "'Inter Tight', sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 480 }}>{children}</div>
    </div>
  );
}

const miniLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
  color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
  fontFamily: "'JetBrains Mono', monospace",
  marginBottom: 4,
};

const valueBlock: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.4,
  color: 'var(--bone)',
  fontFamily: "'Inter Tight', sans-serif",
  background: 'rgba(0,0,0,0.20)',
  border: '1px solid rgba(245,241,232,0.10)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 10px',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};

function actionPill(color: string): React.CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: 'var(--radius-md)',
    border: `1.5px solid ${color}`,
    background: 'transparent',
    color,
    fontFamily: "'Inter Tight', sans-serif",
    fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  };
}

function pillStyle(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '6px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--bone)',
    background: 'transparent',
    color: 'var(--bone)',
    fontFamily: "'Inter Tight', sans-serif",
    fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };
}

function togglePill(): React.CSSProperties {
  return {
    padding: '5px 12px',
    borderRadius: 'var(--radius-full)',
    border: '1.5px solid rgba(245,241,232,0.30)',
    background: 'transparent',
    color: 'rgba(245,241,232,0.85)',
    fontFamily: "'Inter Tight', sans-serif",
    fontSize: 12, fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.02em',
  };
}

function StatCell({
  label, value, sublabel, accent,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: string;
}) {
  return (
    <div style={{
      border: '1px solid rgba(245,241,232,0.20)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 12px',
      background: 'rgba(0,0,0,0.20)',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '0.10em',
        color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
        fontFamily: "'JetBrains Mono', monospace",
        marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 800,
        color: accent ?? 'var(--bone)',
        fontFamily: "'Inter Tight', sans-serif",
        lineHeight: 1.1,
      }}>{value}</div>
      {sublabel && (
        <div style={{
          fontSize: 10,
          color: 'rgba(245,241,232,0.45)',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.04em',
          marginTop: 3,
        }}>{sublabel}</div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 9, fontWeight: 800, letterSpacing: '0.10em',
  color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
  fontFamily: "'JetBrains Mono', monospace",
  borderBottom: '1px solid rgba(245,241,232,0.15)',
};

const td: React.CSSProperties = {
  padding: '7px 12px',
  fontSize: 12,
  color: 'var(--bone)',
  fontFamily: "'Inter Tight', sans-serif",
  borderBottom: '1px solid rgba(245,241,232,0.07)',
};
