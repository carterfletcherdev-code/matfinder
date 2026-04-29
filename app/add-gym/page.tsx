'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';

const DISCIPLINES = [
  { value: 'bjj', label: 'BJJ (Gi/No-Gi – not sure)' },
  { value: 'gi_bjj', label: 'Gi BJJ' },
  { value: 'nogi_bjj', label: 'No-Gi BJJ' },
  { value: 'wrestling', label: 'Wrestling' },
  { value: 'judo', label: 'Judo' },
  { value: 'muay_thai', label: 'Muay Thai' },
  { value: 'mma', label: 'MMA' },
  { value: 'kickboxing', label: 'Kickboxing' },
  { value: 'boxing', label: 'Boxing' },
  { value: 'karate', label: 'Karate' },
  { value: 'taekwondo', label: 'Taekwondo' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface Session {
  day: string;
  start: string;
  end: string;
  isFree: boolean;
  cost: string;
}

export default function AddGymPage() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('US');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [discipline, setDiscipline] = useState('bjj');
  const [dropIn, setDropIn] = useState(false);
  const [loanerGi, setLoanerGi] = useState(false);
  const [freeVisitors, setFreeVisitors] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([
    { day: 'Saturday', start: '10:00', end: '12:00', isFree: true, cost: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function addSession() {
    setSessions(prev => [...prev, { day: 'Saturday', start: '10:00', end: '12:00', isFree: true, cost: '' }]);
  }

  function removeSession(i: number) {
    setSessions(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateSession(i: number, field: keyof Session, value: string | boolean) {
    setSessions(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  function buildMailto() {
    const sessionsText = sessions.map(s =>
      `  - ${s.day} ${s.start}–${s.end}  ${s.isFree ? 'FREE' : `$${s.cost}`}`
    ).join('\n');

    const useCases = [
      dropIn && 'Drop-in friendly',
      loanerGi && 'Loaner gi available',
      freeVisitors && 'Free for visitors',
    ].filter(Boolean).join(', ');

    const body = [
      `Gym Name: ${name}`,
      address ? `Address: ${address}` : '',
      `City: ${city}`,
      `State/Province: ${state}`,
      `Country: ${country}`,
      `Website: ${website || 'N/A'}`,
      `Instagram: ${instagram || 'N/A'}`,
      `Discipline: ${DISCIPLINES.find(d => d.value === discipline)?.label}`,
      ``,
      `Open Mat Schedule:`,
      sessionsText,
      ``,
      useCases ? `Features: ${useCases}` : '',
      notes ? `Notes: ${notes}` : '',
    ].filter(l => l !== undefined).join('\n');

    return `mailto:carterfletcherdev@gmail.com?subject=${encodeURIComponent(`Add Gym: ${name} (${city}, ${country})`)}&body=${encodeURIComponent(body)}`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    window.location.href = buildMailto();
    setSubmitted(true);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--border)',
    background: 'var(--surface-base)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: "'Inter Tight', sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-primary)',
    fontFamily: "'Inter Tight', sans-serif",
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 4,
    display: 'block',
  };

  const checkStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontFamily: "'Inter Tight', sans-serif",
    color: 'var(--text-primary)',
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <div style={{
      minHeight: '100%',
      background: 'var(--surface-sunken)',
      display: 'flex',
      justifyContent: 'center',
      // Top padding bumped to 72px so the fixed Back-to-Map pill in the
      // top-right never overlaps the form's heading. Side padding stays at
      // 16px on mobile, the inner card handles its own padding.
      padding: '72px 16px 32px',
      overflowY: 'auto',
      // Lock horizontal scroll — without this, an overly wide schedule
      // row could push the entire form sideways on small viewports.
      overflowX: 'hidden',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Sticky bone-outlined Back-to-map pill — top-right of the
          viewport. Matches the Favorites + Claim page back buttons so
          there's one consistent way to return to the map across the app. */}
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
          fontFamily: "'Inter Tight', sans-serif",
          fontSize: 13, fontWeight: 700,
          textDecoration: 'none',
          boxShadow: 'var(--shadow-md)',
        }}
      >Back to Map</Link>

      <div style={{ width: '100%', maxWidth: 600 }}>

        <div style={{
          background: 'var(--surface-raised)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          // Responsive horizontal padding — 16px on narrow phones, scales
          // up to 32px on desktop. Reclaims ~32px of usable width on
          // mobile so time-input cards never crowd the edge.
          padding: '28px clamp(16px, 4vw, 32px)',
          boxSizing: 'border-box',
          width: '100%',
        }}>
          <h1 style={{
            fontFamily: "'Archivo Black', sans-serif",
            fontSize: 24, fontWeight: 900,
            color: 'var(--text-primary)',
            margin: '0 0 4px',
          }}>
            Add Gym
          </h1>
          <p style={{
            fontFamily: "'Inter Tight', sans-serif",
            fontSize: 14, color: 'var(--text-muted)',
            margin: '0 0 28px',
          }}>
            Help the community find open mats. This opens your email with everything pre-filled — just hit send.
          </p>

          {submitted && (
            <div style={{
              background: '#DCFCE7', border: '1px solid #86EFAC',
              borderRadius: 'var(--radius-md)', padding: '12px 16px',
              marginBottom: 20, fontSize: 13, fontFamily: "'Inter Tight', sans-serif",
              color: '#166534',
            }}>
              Your email client should have opened. Thanks for contributing!
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Gym info */}
            <div>
              <label style={labelStyle}>Gym name *</label>
              <input required value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. 10th Planet Austin" />
            </div>

            <div>
              <label style={labelStyle}>Street address</label>
              <input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} placeholder="e.g. 123 Main St" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>City *</label>
                <input required value={city} onChange={e => setCity(e.target.value)} style={inputStyle} placeholder="Austin" />
              </div>
              <div>
                <label style={labelStyle}>State / Province</label>
                <input value={state} onChange={e => setState(e.target.value)} style={inputStyle} placeholder="TX" />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Country *</label>
              <input required value={country} onChange={e => setCountry(e.target.value)} style={inputStyle} placeholder="US" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Website</label>
                <input type="url" value={website} onChange={e => setWebsite(e.target.value)} style={inputStyle} placeholder="https://..." />
              </div>
              <div>
                <label style={labelStyle}>Instagram</label>
                <input value={instagram} onChange={e => setInstagram(e.target.value)} style={inputStyle} placeholder="@gymhandle" />
              </div>
            </div>

            {/* Discipline */}
            <div>
              <label style={labelStyle}>Primary discipline *</label>
              <select required value={discipline} onChange={e => setDiscipline(e.target.value)} style={{ ...inputStyle }}>
                {DISCIPLINES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>

            {/* Use-case flags */}
            <div>
              <label style={labelStyle}>Gym features</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={checkStyle}>
                  <input type="checkbox" checked={dropIn} onChange={e => setDropIn(e.target.checked)} />
                  Drop-in friendly (visitors from other gyms welcome)
                </label>
                <label style={checkStyle}>
                  <input type="checkbox" checked={loanerGi} onChange={e => setLoanerGi(e.target.checked)} />
                  Loaner gi available (for travelers)
                </label>
                <label style={checkStyle}>
                  <input type="checkbox" checked={freeVisitors} onChange={e => setFreeVisitors(e.target.checked)} />
                  Free for visitors (no mat fee to drop in)
                </label>
              </div>
            </div>

            {/* Schedule — each session is a bordered sub-card so the
                fields stack cleanly on mobile and never overflow the
                viewport. Layout per session:
                  Row 1: day select (full width) + remove button
                  Row 2: start time | end time (2 equal columns)
                  Row 3: Free checkbox  · Cost input (when not Free)
                Spacing between sessions = 12px so adjacent rows don't
                visually run together. */}
            <div>
              <label style={labelStyle}>Open mat schedule *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sessions.map((s, i) => (
                  <div key={i} style={{
                    border: '1.5px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    background: 'var(--surface-base)',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {/* Row 1 — day + remove */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        value={s.day}
                        onChange={e => updateSession(i, 'day', e.target.value)}
                        style={{ ...inputStyle, padding: '7px 10px', flex: 1 }}
                      >
                        {DAYS.map(d => <option key={d}>{d}</option>)}
                      </select>
                      {sessions.length > 1 && (
                        <Button
                          type="button"
                          onClick={() => removeSession(i)}
                          variant="secondary"
                          size="sm"
                          style={{
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>

                    {/* Row 2 — start time, then end time. Stacked
                        vertically so the native time picker on iOS Safari
                        (which has extra chrome around hours/minutes/AM-PM)
                        never crowds or clips at narrow widths. Inputs are
                        capped at 220px so they're noticeably smaller than
                        the surrounding card and can never touch the
                        right edge regardless of viewport. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <div style={{ ...labelStyle, fontSize: 9, marginBottom: 3 }}>Start time</div>
                        <input
                          type="time"
                          value={s.start}
                          onChange={e => updateSession(i, 'start', e.target.value)}
                          style={{
                            ...inputStyle,
                            padding: '8px 12px',
                            colorScheme: 'light dark',
                            maxWidth: 220,
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ ...labelStyle, fontSize: 9, marginBottom: 3 }}>End time</div>
                        <input
                          type="time"
                          value={s.end}
                          onChange={e => updateSession(i, 'end', e.target.value)}
                          style={{
                            ...inputStyle,
                            padding: '8px 12px',
                            colorScheme: 'light dark',
                            maxWidth: 220,
                          }}
                        />
                      </div>
                    </div>

                    {/* Row 3 — free toggle + (optional) cost */}
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      gap: 12, flexWrap: 'wrap',
                    }}>
                      <label style={{ ...checkStyle, whiteSpace: 'nowrap', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={s.isFree}
                          onChange={e => updateSession(i, 'isFree', e.target.checked)}
                        />
                        Free open mat
                      </label>
                      {!s.isFree && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 12, color: 'var(--text-muted)',
                            fontFamily: "'Inter Tight', sans-serif",
                          }}>Drop-in cost</span>
                          <input
                            type="number" min={0} placeholder="$"
                            value={s.cost}
                            onChange={e => updateSession(i, 'cost', e.target.value)}
                            style={{ ...inputStyle, padding: '7px 10px', width: 80 }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  onClick={addSession}
                  variant="secondary"
                  size="sm"
                  style={{
                    alignSelf: 'flex-start',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Add another session
                </Button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={labelStyle}>Additional notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Anything else we should know? (parking, reservation required, etc.)"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              style={{ alignSelf: 'flex-start', fontWeight: 700, fontSize: 14 }}
            >
              Submit gym
            </Button>

            <p style={{
              fontSize: 11, color: 'var(--text-muted)',
              fontFamily: "'Inter Tight', sans-serif",
              margin: 0,
            }}>
              Submissions are reviewed before being added. Data is community-owned and free forever.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
