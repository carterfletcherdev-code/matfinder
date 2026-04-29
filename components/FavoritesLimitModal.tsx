'use client';

import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { useFavorites } from './FavoritesProvider';
import { Button } from './ui';

const PLANS = [
  {
    id: 'pro' as const,
    name: 'Pro',
    monthlyPrice: '$6.99',
    color: '#C9A24A',
    badge: 'BEST VALUE',
    favoritesLabel: 'Unlimited saved gyms',
    features: [
      'Live calendar subscription — sync to Apple, Google, or Outlook',
      'Visited-pin training history',
      'Unlimited check-in history',
      'Priority support',
      'Early access to new features',
    ],
    billings: [
      // Annual first — leads with the savings framing.
      { id: 'pro_annual', label: 'Annually', price: '$59.99/yr', sublabel: 'Works out to $5/mo', savings: 'Save 28% vs monthly' },
      { id: 'pro',        label: 'Monthly',  price: '$6.99/mo',  sublabel: null,                  savings: null },
    ],
  },
];

export function FavoritesLimitModal() {
  const { user, tier, requireAuth } = useAuth();
  const { showLimitModal, setShowLimitModal, count, limit } = useFavorites();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  if (!showLimitModal) return null;

  const close = () => { setShowLimitModal(false); setCheckoutError(null); };

  const subscribe = async (planId: string) => {
    if (!user) { requireAuth(() => {}); return; }
    setLoadingPlan(planId);
    setCheckoutError(null);
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
        setCheckoutError(data.error || 'Could not start checkout. Please try again.');
        setLoadingPlan(null);
      }
    } catch {
      setCheckoutError('Network error. Please try again.');
      setLoadingPlan(null);
    }
  };

  // Only Pro is now offered. Standard is grandfathered for any existing
  // subscriber but no longer shown as an upgrade option.
  const visiblePlans = PLANS;

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(20,13,9,0.98)',
          color: 'var(--bone)',
          border: '1px solid rgba(245,241,232,0.15)',
          borderRadius: 14,
          padding: '22px 22px 18px',
          width: '100%', maxWidth: 420,
          boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
          fontFamily: "'Inter Tight', sans-serif",
          maxHeight: '90dvh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--bone)' }}>
              Favorites limit reached
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(245,241,232,0.55)' }}>
              You&apos;ve saved {count} of {limit === Infinity ? '∞' : limit} gyms on the{' '}
              <span style={{ fontWeight: 700, color: 'var(--bone)', textTransform: 'capitalize' }}>{tier}</span> plan.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={close}
            aria-label="Close"
            style={{
              color: 'rgba(245,241,232,0.5)',
              padding: '0 6px',
              fontSize: 20,
              fontWeight: 400,
              height: 28,
              minWidth: 28,
              flexShrink: 0,
            }}
          >×</Button>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(245,241,232,0.6)' }}>
          Upgrade to save more gyms:
        </p>

        {/* Plan cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visiblePlans.map(plan => {
            const isCurrent = tier === plan.id;
            return (
              <div
                key={plan.id}
                style={{
                  background: isCurrent ? 'rgba(245,241,232,0.04)' : 'rgba(245,241,232,0.06)',
                  border: `1.5px solid ${isCurrent ? plan.color : 'rgba(245,241,232,0.12)'}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  position: 'relative',
                  opacity: isCurrent ? 0.85 : 1,
                }}
              >
                {/* BEST VALUE badge */}
                {plan.badge && !isCurrent && (
                  <div style={{
                    position: 'absolute', top: -10, left: 14,
                    background: plan.color, color: '#1A1310',
                    fontSize: 8, fontWeight: 800, letterSpacing: '0.1em',
                    padding: '2px 8px', borderRadius: 4,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {plan.badge}
                  </div>
                )}

                {/* Plan name + price row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: plan.badge && !isCurrent ? 4 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: plan.color }}>{plan.name}</span>
                    {isCurrent && (
                      <span style={{
                        fontSize: 9, color: plan.color,
                        border: `1px solid ${plan.color}`,
                        borderRadius: 20, padding: '1px 7px',
                        fontWeight: 700, letterSpacing: '0.04em',
                      }}>
                        Current plan
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--bone)' }}>
                      {plan.monthlyPrice}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(245,241,232,0.45)', fontWeight: 500 }}>/mo</span>
                    {plan.billings.length > 1 && (
                      <div style={{ fontSize: 10, color: plan.color, fontWeight: 600, marginTop: 1 }}>
                        or $59.99/yr · save 28%
                      </div>
                    )}
                  </div>
                </div>

                {/* Features */}
                <ul style={{
                  margin: '0 0 12px', paddingLeft: 0, listStyle: 'none',
                  fontSize: 12, color: 'rgba(245,241,232,0.65)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: plan.color, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>✓</span>
                    <span style={{ color: 'var(--bone)', fontWeight: 600 }}>{plan.favoritesLabel}</span>
                  </li>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: plan.color, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA buttons — only for non-current tiers */}
                {!isCurrent && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {plan.billings.map(b => {
                      const isLoading = loadingPlan === b.id;
                      return (
                        <Button
                          key={b.id}
                          onClick={() => subscribe(b.id)}
                          disabled={!!loadingPlan}
                          loading={isLoading}
                          variant="primary"
                          size="md"
                          fullWidth
                          style={{
                            background: plan.color,
                            color: '#1A1310',
                            borderColor: plan.color,
                            justifyContent: 'space-between',
                            opacity: !isLoading && loadingPlan ? 0.5 : undefined,
                            cursor: isLoading ? 'wait' : loadingPlan ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                            <span>
                              {isLoading ? 'Opening checkout…' : `Get ${plan.name} ${b.label}`}
                            </span>
                            {b.savings && !isLoading && (
                              <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.75, letterSpacing: '0.02em' }}>
                                {b.savings}
                              </span>
                            )}
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 800 }}>{b.price}</span>
                            {b.sublabel && (
                              <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>{b.sublabel}</span>
                            )}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                )}

                {/* "Already on this plan" note */}
                {isCurrent && (
                  <p style={{ margin: 0, fontSize: 11, color: 'rgba(245,241,232,0.4)', fontStyle: 'italic' }}>
                    You&apos;re already on this plan.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {checkoutError && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 7,
            background: 'rgba(255,100,100,0.12)', border: '1px solid rgba(255,100,100,0.3)',
            color: '#ff8080', fontSize: 12,
          }}>
            {checkoutError}
          </div>
        )}

        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'rgba(245,241,232,0.35)', textAlign: 'center' }}>
          Or remove some favorites to make room.
          <br />
          Payments processed securely by Stripe.
        </p>
      </div>
    </div>
  );
}
