'use client';

import { useState } from 'react';
import Link from 'next/link';

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
      padding: '32px 16px',
      overflowY: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 600 }}>
        {/* Back link */}
        <Link href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
          textDecoration: 'none', marginBottom: 24,
          fontFamily: "'Inter Tight', sans-serif",
        }}>
          ← Back to map
        </Link>

        <div style={{
          background: 'var(--surface-raised)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          padding: '28px 32px',
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

            {/* Schedule */}
            <div>
              <label style={labelStyle}>Open mat schedule *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sessions.map((s, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '120px 90px 90px auto auto',
                    gap: 8, alignItems: 'center',
                  }}>
                    <select value={s.day} onChange={e => updateSession(i, 'day', e.target.value)} style={{ ...inputStyle, padding: '7px 10px' }}>
                      {DAYS.map(d => <option key={d}>{d}</option>)}
                    </select>
                    <input type="time" value={s.start} onChange={e => updateSession(i, 'start', e.target.value)} style={{ ...inputStyle, padding: '7px 10px', colorScheme: 'light dark' }} />
                    <input type="time" value={s.end} onChange={e => updateSession(i, 'end', e.target.value)} style={{ ...inputStyle, padding: '7px 10px', colorScheme: 'light dark' }} />
                    <label style={{ ...checkStyle, whiteSpace: 'nowrap', fontSize: 12 }}>
                      <input type="checkbox" checked={s.isFree} onChange={e => updateSession(i, 'isFree', e.target.checked)} />
                      Free
                    </label>
                    {!s.isFree && (
                      <input type="number" min={0} placeholder="$" value={s.cost} onChange={e => updateSession(i, 'cost', e.target.value)} style={{ ...inputStyle, padding: '7px 10px', width: 60 }} />
                    )}
                    {sessions.length > 1 && (
                      <button type="button" onClick={() => removeSession(i)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: 16, padding: '0 4px',
                      }}>✕</button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSession}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: 12, fontWeight: 600,
                    fontFamily: "'Inter Tight', sans-serif",
                    cursor: 'pointer',
                  }}
                >
                  + Add another session
                </button>
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

            <button
              type="submit"
              style={{
                padding: '12px 24px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--accent)',
                color: 'var(--bone)',
                fontSize: 14, fontWeight: 700,
                fontFamily: "'Inter Tight', sans-serif",
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Submit gym →
            </button>

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
