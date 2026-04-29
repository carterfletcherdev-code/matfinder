'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Header from '@/components/Header';
import BackButton from '@/components/BackButton';
import { Button } from '@/components/ui';

type Billing = { id: string; label: string; price: string; sublabel?: string; savings?: string };

const PLANS: {
  id: 'pro';
  name: string;
  price: string;
  color: string;
  badge: string | null;
  features: string[];
  billings: Billing[];
}[] = [
  {
    id: 'pro',
    name: 'Pro',
    price: '$6.99',
    color: '#C9A24A',
    badge: 'BEST VALUE',
    features: [
      'Unlimited saved gyms',
      'Live calendar subscription — sync every favorited gym\'s open mats to Apple, Google, or Outlook Calendar',
      'Visited-pin training history on the map',
      'Unlimited check-in history (Free is limited to the last 30 days)',
      'Priority support',
      'Early access to new features',
    ],
    billings: [
      // Annual first — leads with the savings framing.
      { id: 'pro_annual', label: 'Annually', price: '$59.99/yr', sublabel: 'Works out to $5.00/mo', savings: 'Save 28% vs monthly' },
      { id: 'pro',        label: 'Monthly',  price: '$6.99/mo' },
    ],
  },
];

export default function UpgradePage() {
  const { user, tier, requireAuth } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subscribe = async (planId: string) => {
    if (!user) { requireAuth(() => {}); return; }
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch('/api/stripe/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, userId: user.id, email: user.email }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Could not start checkout. Please try again.');
        setLoading(null);
      }
    } catch {
      setError('Network error. Please try again.');
      setLoading(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
      <style>{`
        .upgrade-card:hover {
          transform: scale(1.025);
          box-shadow: 0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(245,241,232,0.4);
        }
      `}</style>
      <Header hideAddGym hideSignOut />
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px 48px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontFamily: "'Inter Tight', sans-serif", fontWeight: 800 }}>Upgrade</h1>
            <BackButton fallbackHref="/account">Back</BackButton>
          </div>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-muted)', fontFamily: "'Inter Tight', sans-serif" }}>
            Support MatFinder and unlock more features.
          </p>

          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(255,100,100,0.1)', border: '1px solid rgba(255,100,100,0.3)',
              color: '#ff6b6b', fontSize: 13, fontFamily: "'Inter Tight', sans-serif",
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {PLANS.map(plan => {
              const isCurrent = tier === plan.id;
              return (
                <div key={plan.id} className="upgrade-card" style={{
                  background: 'var(--surface-raised)',
                  border: `2px solid ${isCurrent ? plan.color : 'var(--bone)'}`,
                  borderRadius: 12, padding: 22,
                  position: 'relative',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                }}>
                  {plan.badge && (
                    <div style={{
                      position: 'absolute', top: -11, left: 16,
                      background: plan.color, color: '#1A1310',
                      fontSize: 9, fontWeight: 800, fontFamily: "'Inter Tight', sans-serif",
                      letterSpacing: '0.08em', padding: '2px 8px', borderRadius: 4,
                    }}>
                      {plan.badge}
                      <span style={{
                        position: 'absolute', top: -10, right: -8,
                        fontSize: 14, lineHeight: 1,
                        transform: 'rotate(22deg)',
                        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
                        pointerEvents: 'none',
                      }}>
                        👑
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 17, fontWeight: 800, color: plan.color, fontFamily: "'Inter Tight', sans-serif" }}>{plan.name}</span>
                      {isCurrent && (
                        <span style={{ fontSize: 10, color: plan.color, border: `1px solid ${plan.color}`, borderRadius: 20, padding: '1px 8px', fontFamily: "'Inter Tight', sans-serif", fontWeight: 700 }}>
                          Current plan
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, fontFamily: "'Inter Tight', sans-serif" }}>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>
                        {plan.price}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>/mo</span>
                      </div>
                      {plan.billings.length > 1 && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: plan.color, letterSpacing: '0.01em' }}>
                          or $59.99/year · save 28%
                        </div>
                      )}
                    </div>
                  </div>
                  <ul style={{ margin: '0 0 16px', paddingLeft: 0, listStyle: 'none', fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 5, fontFamily: "'Inter Tight', sans-serif" }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ color: plan.color, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {plan.billings.map(b => {
                        const isLoading = loading === b.id;
                        return (
                          <Button
                            key={b.id}
                            onClick={() => subscribe(b.id)}
                            disabled={!!loading}
                            loading={isLoading}
                            variant="primary"
                            size="lg"
                            fullWidth
                            style={{
                              background: plan.color,
                              color: '#1A1310',
                              borderColor: plan.color,
                              justifyContent: 'space-between',
                              cursor: isLoading ? 'wait' : loading ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                              <span>{isLoading ? 'Opening checkout…' : `Get ${plan.name} ${b.label}`}</span>
                              {b.savings && !isLoading && (
                                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, letterSpacing: '0.02em' }}>
                                  {b.savings}
                                </span>
                              )}
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                              <span style={{ fontSize: 14, fontWeight: 800 }}>{b.price}</span>
                              {b.sublabel && (
                                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{b.sublabel}</span>
                              )}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p style={{ marginTop: 20, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', fontFamily: "'Inter Tight', sans-serif", lineHeight: 1.5 }}>
            Payments processed securely by Stripe. Cancel anytime from your account.
          </p>
        </div>
      </div>
    </div>
  );
}
