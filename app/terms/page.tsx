import type { Metadata } from 'next';
import BackButton from '@/components/BackButton';

export const metadata: Metadata = {
  title: 'Terms of Service — MatFinder',
  description: 'Terms of service for MatFinder.',
};

export default function TermsPage() {
  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text-primary)',
      fontFamily: "'Inter Tight', sans-serif",
      overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px 80px' }}>
        <BackButton fallbackHref="/" />

        <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 32, marginTop: 32, marginBottom: 8 }}>
          Terms of Service
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 40 }}>
          Last updated: April 26, 2026
        </p>

        {[
          {
            title: '1. Acceptance',
            body: `By using MatFinder ("the Service"), you agree to these Terms. If you do not agree, do not use the Service. We may update these Terms from time to time; continued use of the Service constitutes acceptance of the updated Terms.`,
          },
          {
            title: '2. What MatFinder Is',
            body: `MatFinder is a directory of martial arts gyms and open mat sessions. Schedule and contact information is sourced from public websites and may not always be current. We make no guarantee that any gym, open mat session, or schedule is accurate, active, or available. Always confirm directly with the gym before visiting.`,
          },
          {
            title: '3. User Accounts',
            body: `You must provide a valid email address to create an account. You are responsible for maintaining the security of your account. We may suspend or terminate accounts that violate these Terms.`,
          },
          {
            title: '4. Featured Listings',
            body: `Gym owners may pay $50/month for a Featured Listing, which gives their gym prominent placement in search results and on the map. The $50/month fee is billed monthly through Stripe and may be cancelled at any time; cancellation takes effect at the end of the current billing period. MatFinder reserves the right to reject or remove any Featured Listing that violates these Terms or contains false information.`,
          },
          {
            title: '5. User Content',
            body: `When you submit corrections, ratings, or other content, you grant MatFinder a non-exclusive license to use, display, and store that content to improve the Service. You represent that your submissions are accurate to the best of your knowledge.`,
          },
          {
            title: '6. Prohibited Use',
            body: `You may not scrape, copy, or redistribute MatFinder's gym database. You may not submit false information or abuse the corrections or ratings system. You may not use the Service for any unlawful purpose.`,
          },
          {
            title: '7. Disclaimer',
            body: `The Service is provided "as is" without warranty of any kind. MatFinder is not responsible for inaccurate gym information, cancelled sessions, or any injury or loss arising from reliance on information in the Service.`,
          },
          {
            title: '8. Limitation of Liability',
            body: `To the maximum extent permitted by law, MatFinder's liability for any claim arising from use of the Service is limited to the amount you paid us in the 12 months prior to the claim, or $50, whichever is greater.`,
          },
          {
            title: '9. Governing Law',
            body: `These Terms are governed by the laws of the State of Texas, without regard to conflict of law principles.`,
          },
          {
            title: '10. Contact',
            body: `Questions about these Terms? Email carterfletcherdev@gmail.com.`,
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
