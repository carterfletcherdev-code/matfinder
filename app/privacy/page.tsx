import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — MatFinder',
  description: 'Privacy policy for MatFinder.',
};

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text-primary)',
      fontFamily: "'Inter Tight', sans-serif",
      overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px 80px' }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'none' }}>
          ← Back to MatFinder
        </Link>

        <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 32, marginTop: 32, marginBottom: 8 }}>
          Privacy Policy
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 40 }}>
          Last updated: April 26, 2026
        </p>

        {[
          {
            title: '1. What We Collect',
            body: `When you create an account, we collect your email address to send you a sign-in link. We store your favorites and ratings linked to your account. If you claim a gym listing, we collect your name, email, and billing information (processed by Stripe — we never store your card details). We also collect anonymous usage data (pages visited, filters used) through Vercel Analytics to improve the product.`,
          },
          {
            title: '2. How We Use It',
            body: `Your email is used solely for authentication (magic link sign-in) and billing-related communication. We do not send marketing emails. Your favorites and ratings are stored to provide the service. Anonymous analytics help us understand which features are useful.`,
          },
          {
            title: '3. Data Sharing',
            body: `We do not sell your personal data. We share data only with the services that power MatFinder: Supabase (database and authentication), Stripe (payment processing), Vercel (hosting and analytics), and Mapbox (map tiles). Each of these has their own privacy policy governing how they handle data.`,
          },
          {
            title: '4. Gym Data',
            body: `Gym names, addresses, schedules, and contact details are sourced from public websites, Google Places, and OpenStreetMap. If you are a gym owner and believe any information about your gym is incorrect, use the "Report incorrect info" button on your gym's listing, or contact us at hello@matfinder.app.`,
          },
          {
            title: '5. Cookies & Storage',
            body: `We use browser localStorage to remember your theme preference (light/dark). Supabase uses cookies to maintain your signed-in session. We do not use third-party tracking cookies.`,
          },
          {
            title: '6. Data Retention',
            body: `If you delete your account, we delete your email, favorites, and ratings within 30 days. Ratings and favorites are anonymized in aggregate statistics that may persist. Stripe retains billing records as required by law.`,
          },
          {
            title: '7. Your Rights',
            body: `You can request a copy of your data, ask us to delete your account, or correct inaccurate information by emailing hello@matfinder.app. EU/UK residents have additional rights under GDPR.`,
          },
          {
            title: '8. Contact',
            body: `Questions? Email us at hello@matfinder.app.`,
          },
        ].map(({ title, body }) => (
          <div key={title} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 15 }}>{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
