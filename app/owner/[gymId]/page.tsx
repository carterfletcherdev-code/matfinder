'use client';

// Gym owner portal — schedule editor for a verified gym owner.
// Routes:
//   GET /owner/[gymId]                 — this page
//   GET /api/owner/schedule?gym_id=…   — fetch current schedule
//   POST /api/owner/schedule           — save edited schedule
//
// Editor handles the FULL class schedule, not just open mats. Each row
// has a checkbox to mark that class as an open mat — the saved data
// drives both the gym's full schedule view and (for is_open_mat rows)
// the open_mats list used everywhere else in the app.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { supabase, supabaseEnabled } from '@/lib/supabase';
import type { ScheduleEntry, DayOfWeek, Discipline } from '@/lib/types';
import { DISCIPLINE_LABELS } from '@/lib/types';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
  sunday: 'Sunday',
};
const DISCIPLINES: Discipline[] = ['bjj', 'nogi_bjj', 'gi_bjj', 'wrestling', 'judo', 'muay_thai', 'mma', 'kickboxing', 'boxing', 'karate', 'taekwondo'];

interface OwnerSchedule {
  schedule: ScheduleEntry[];
  website?: string | null;
  phone?: string | null;
  instagram?: string | null;
}

export default function OwnerSchedulePage() {
  const params = useParams<{ gymId: string }>();
  const gymId = params.gymId;
  const { user, loading: authLoading, requireAuth } = useAuth();

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[] | null>(null);
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [gymName, setGymName] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Index of a row that was just added — used to flash a brief highlight
  // so the user can see exactly which entry the Add Class button created.
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  // Add Class modal — opens with empty defaults; user fills in then submits.
  // The new entry slots into the correct day-of-week section automatically.
  const [addOpen, setAddOpen] = useState(false);
  // Portal target for modals. document.body so backdrop covers viewport
  // regardless of containing-block transforms / blur filters.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalTarget(document.body); }, []);

  // Pull a fresh access token whenever the user changes — server route
  // checks gym_owners.user_id == auth.uid() so we have to forward the
  // current session's bearer.
  useEffect(() => {
    if (!supabaseEnabled || !user) { setAuthToken(null); return; }
    supabase.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
    });
  }, [user]);

  // Look up the gym name (just for the header) from /api/gyms.
  useEffect(() => {
    fetch('/api/gyms')
      .then(r => r.json())
      .then((all: Array<{ id: string; name: string }>) => {
        const g = all.find(x => x.id === gymId);
        if (g) setGymName(g.name);
      })
      .catch(() => {});
  }, [gymId]);

  // Fetch the editable schedule.
  useEffect(() => {
    if (!authToken) return;
    setLoadError(null);
    fetch(`/api/owner/schedule?gym_id=${encodeURIComponent(gymId)}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          throw new Error(j?.error ?? `${r.status}`);
        }
        return r.json() as Promise<OwnerSchedule>;
      })
      .then((data) => {
        setSchedule(data.schedule ?? []);
        setWebsite(data.website ?? '');
        setPhone(data.phone ?? '');
        setInstagram(data.instagram ?? '');
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [authToken, gymId]);

  function updateRow(i: number, patch: Partial<ScheduleEntry>) {
    setSchedule(prev => prev ? prev.map((r, idx) => idx === i ? { ...r, ...patch } : r) : prev);
    setSaveStatus('idle');
  }
  // Called from the Add Class modal once the user has filled in the
  // class details. Inserts the row and flashes its position in the
  // correct day-of-week section.
  function commitNewClass(entry: ScheduleEntry) {
    let newIndex = 0;
    setSchedule(prev => {
      const next = [...(prev ?? []), entry];
      newIndex = next.length - 1;
      return next;
    });
    setAddOpen(false);
    setSaveStatus('idle');
    setFlashIndex(newIndex);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-row-index="${newIndex}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    setTimeout(() => setFlashIndex(null), 2200);
  }
  function openAddModal() { setAddOpen(true); }
  function removeRow(i: number) {
    setSchedule(prev => prev ? prev.filter((_, idx) => idx !== i) : prev);
    setSaveStatus('idle');
  }

  async function save() {
    if (!authToken || !schedule) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/owner/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          gym_id: gymId,
          schedule,
          website: website.trim() || null,
          phone: phone.trim() || null,
          instagram: instagram.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErrorMsg(j.error ?? 'Save failed');
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Network error');
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  // Group schedule rows by day-of-week for nicer display
  const grouped = useMemo(() => {
    if (!schedule) return null;
    const map: Record<DayOfWeek, Array<{ entry: ScheduleEntry; index: number }>> = {
      monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
    };
    schedule.forEach((entry, index) => map[entry.day].push({ entry, index }));
    DAYS.forEach(d => map[d].sort((a, b) => a.entry.start_time.localeCompare(b.entry.start_time)));
    return map;
  }, [schedule]);

  // ── Render gates ──
  if (authLoading) {
    return <CenteredMsg>Checking your account…</CenteredMsg>;
  }
  if (!user) {
    return (
      <CenteredMsg>
        <p style={{ marginBottom: 14 }}>You need to sign in to manage this gym.</p>
        <button
          onClick={() => requireAuth(() => {})}
          style={pillStyle()}
        >Sign in</button>
      </CenteredMsg>
    );
  }
  if (loadError === '403' || loadError === 'Not authorized') {
    return (
      <CenteredMsg>
        <p style={{ marginBottom: 6 }}>You&rsquo;re not the verified owner of this gym.</p>
        <p style={{ fontSize: 13, color: 'rgba(245,241,232,0.55)', marginBottom: 14 }}>
          If you should have access, contact{' '}
          <a href="mailto:carterfletcherdev@gmail.com" style={{ color: 'var(--bone)' }}>carterfletcherdev@gmail.com</a>.
        </p>
        <Link href="/" style={pillStyle()}>Back to Map</Link>
      </CenteredMsg>
    );
  }
  if (loadError) {
    return (
      <CenteredMsg>
        <p style={{ marginBottom: 14, color: '#E06060' }}>Couldn&rsquo;t load schedule: {loadError}</p>
        <Link href="/" style={pillStyle()}>Back to Map</Link>
      </CenteredMsg>
    );
  }
  if (!schedule || !grouped) {
    return <CenteredMsg>Loading schedule…</CenteredMsg>;
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      color: 'var(--bone)',
      fontFamily: "'Inter Tight', sans-serif",
      overflowY: 'auto',
      position: 'relative',
      padding: '72px 16px 32px',
    }}>
      {/* Sticky bone-outlined Back-to-Map pill — same pattern as
          /favorites and /add-gym. */}
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

      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'var(--brown-700, #3E2E20)',
          border: '1.5px solid var(--bone)',
          borderRadius: 'var(--radius-md)',
          padding: '18px 22px',
          marginBottom: 24,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.10em',
            color: '#C9A24A', textTransform: 'uppercase',
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: 4,
          }}>Featured · Verified owner</div>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 800,
            fontFamily: "'Inter Tight', sans-serif",
          }}>Manage {gymName || 'gym'}</h1>
          <p style={{
            margin: '4px 0 0', fontSize: 13,
            color: 'rgba(245,241,232,0.65)',
          }}>
            Your existing schedule is pre-loaded below — edit any class, add
            new ones, remove anything that&rsquo;s wrong. Use the{' '}
            <b style={{ color: 'var(--bone)' }}>Open mat</b> checkbox to mark
            which classes are public open mats; those show up in MatFinder&rsquo;s
            open-mat list and on the map. Unchecked classes still appear in
            your full schedule view but aren&rsquo;t treated as open mats.
          </p>
        </div>

        {/* Schedule editor */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={sectionLabel}>Class schedule</div>
          <button onClick={openAddModal} style={pillStyle()}>+ Add class</button>
        </div>

        {DAYS.map(day => {
          const rows = grouped[day];
          if (rows.length === 0) return null;
          return (
            <div key={day} style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.10em',
                color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 8,
              }}>{DAY_LABELS[day]}</div>
              {rows.map(({ entry, index }) => (
                <ScheduleRow
                  key={index}
                  index={index}
                  flash={flashIndex === index}
                  entry={entry}
                  onChange={(patch) => updateRow(index, patch)}
                  onRemove={() => removeRow(index)}
                />
              ))}
            </div>
          );
        })}

        {/* Empty-state nudge */}
        {schedule.length === 0 && (
          <div style={{
            border: '1.5px dashed rgba(245,241,232,0.20)',
            borderRadius: 'var(--radius-md)',
            padding: '24px 20px', textAlign: 'center',
            color: 'rgba(245,241,232,0.65)',
            marginBottom: 18,
          }}>
            No classes yet. Tap <b style={{ color: 'var(--bone)' }}>+ Add class</b> to start building your schedule.
          </div>
        )}

        {/* Second Add Class button — sits at the bottom of the schedule
            list so the user never has to scroll up to find one. */}
        {schedule.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
            <button onClick={openAddModal} style={pillStyle()}>+ Add class</button>
          </div>
        )}

        {/* Listing details */}
        <div style={{ ...sectionLabel, marginTop: 28 }}>Listing details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <FieldRow label="Website" value={website} onChange={setWebsite} placeholder="https://..." />
          <FieldRow label="Phone"   value={phone}   onChange={setPhone}   placeholder="(555) 555-1234" />
          <FieldRow label="Instagram" value={instagram} onChange={setInstagram} placeholder="@yourgym" />
        </div>

        {/* Save bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 0 24px',
          borderTop: '1px solid rgba(245,241,232,0.15)',
        }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ ...pillStyle(), padding: '10px 20px', fontSize: 13, opacity: saving ? 0.5 : 1, cursor: saving ? 'wait' : 'pointer' }}
          >{saving ? 'Saving…' : 'Save changes'}</button>
          {saveStatus === 'saved' && (
            <span style={{
              fontSize: 12, color: 'var(--bone)',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.04em',
            }}>SAVED</span>
          )}
          {saveStatus === 'error' && errorMsg && (
            <span style={{ fontSize: 12, color: '#E06060' }}>{errorMsg}</span>
          )}
          <span style={{
            marginLeft: 'auto', fontSize: 11,
            color: 'rgba(245,241,232,0.45)',
          }}>
            {schedule.length} {schedule.length === 1 ? 'class' : 'classes'} ·
            {' '}{schedule.filter(s => s.is_open_mat && !s.is_kids).length} open mat{schedule.filter(s => s.is_open_mat && !s.is_kids).length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Add Class modal — portalled to body so the dark blurred backdrop
          covers the whole viewport regardless of containing-block traps. */}
      {portalTarget && addOpen && createPortal(
        <AddClassModal
          onCancel={() => setAddOpen(false)}
          onSubmit={commitNewClass}
        />,
        portalTarget,
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Add Class modal — separate panel-style form so users can define a
// class up front instead of editing a default placeholder row.
// ──────────────────────────────────────────────────────────────────────

function AddClassModal({
  onCancel, onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (entry: ScheduleEntry) => void;
}) {
  const [day, setDay] = useState<DayOfWeek>('monday');
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('19:30');
  const [className, setClassName] = useState('');
  const [discipline, setDiscipline] = useState<Discipline>('bjj');
  const [level, setLevel] = useState('');
  const [isOpenMat, setIsOpenMat] = useState(false);
  const [isKids, setIsKids] = useState(false);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!className.trim()) return;
    onSubmit({
      day,
      start_time: startTime,
      end_time: endTime || null,
      class_name: className.trim(),
      discipline,
      is_open_mat: isOpenMat,
      is_kids: isKids,
      level: level.trim() || undefined,
    });
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26,19,16,0.88)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
        padding: '5vh 5vw',
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90vw', maxWidth: 560, maxHeight: '90vh',
          background: 'var(--bg)', color: 'var(--bone)',
          border: '1.5px solid var(--bone)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "'Inter Tight', sans-serif",
        }}
      >
        {/* Sticky header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, padding: '18px 22px',
          borderBottom: '1px solid rgba(245,241,232,0.15)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.10em',
              color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
              fontFamily: "'JetBrains Mono', monospace",
              marginBottom: 4,
            }}>New class</div>
            <h2 style={{
              margin: 0, fontSize: 18, fontWeight: 800,
              fontFamily: "'Inter Tight', sans-serif",
            }}>Add a class to your schedule</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: '1.5px solid var(--bone)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: 12, color: 'var(--bone)', fontWeight: 700,
              fontFamily: "'Inter Tight', sans-serif",
              padding: '5px 12px', flexShrink: 0,
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}
          >Cancel</button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div>
            <div style={miniLabel}>Class name</div>
            <input
              type="text"
              autoFocus
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g. All-Levels BJJ"
              required
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div style={miniLabel}>Day</div>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value as DayOfWeek)}
                style={{ ...inputStyle, width: '100%' }}
              >
                {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={miniLabel}>Start time</div>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'light dark', maxWidth: 220 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={miniLabel}>End time</div>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'light dark', maxWidth: 220 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={miniLabel}>Discipline</div>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as Discipline)}
                style={{ ...inputStyle, width: '100%' }}
              >
                {DISCIPLINES.map(d => (
                  <option key={d} value={d}>
                    {DISCIPLINE_LABELS[d]}
                    {d === 'gi_bjj' ? ' (Gi)' : ''}
                    {d === 'nogi_bjj' ? ' (No-Gi)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={miniLabel}>Level (optional)</div>
              <input
                type="text"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="All levels / Beginner / Advanced"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 4 }}>
            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={isOpenMat}
                onChange={(e) => setIsOpenMat(e.target.checked)}
              />
              <span><b style={{ color: 'var(--bone)' }}>Open mat</b> — show in MatFinder&rsquo;s open-mat list</span>
            </label>
            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={isKids}
                onChange={(e) => setIsKids(e.target.checked)}
              />
              <span>Kids class</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid rgba(245,241,232,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexShrink: 0,
        }}>
          <span style={{
            fontSize: 11,
            color: 'rgba(245,241,232,0.55)',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>Save schedule when done</span>
          <button
            type="submit"
            disabled={!className.trim()}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--bone)',
              background: 'transparent',
              color: 'var(--bone)',
              fontSize: 13, fontWeight: 700,
              cursor: className.trim() ? 'pointer' : 'not-allowed',
              fontFamily: "'Inter Tight', sans-serif",
              letterSpacing: '0.04em', textTransform: 'uppercase',
              opacity: className.trim() ? 1 : 0.5,
            }}
          >Add to schedule</button>
        </div>
      </form>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Building blocks
// ──────────────────────────────────────────────────────────────────────

function ScheduleRow({
  entry, onChange, onRemove, index, flash = false,
}: {
  entry: ScheduleEntry;
  onChange: (patch: Partial<ScheduleEntry>) => void;
  onRemove: () => void;
  index: number;
  flash?: boolean;
}) {
  return (
    <div data-row-index={index} style={{
      border: `1.5px solid ${flash ? 'var(--bone)' : 'rgba(245,241,232,0.20)'}`,
      borderRadius: 'var(--radius-md)',
      padding: '12px 14px',
      background: flash ? 'rgba(245,241,232,0.06)' : 'var(--surface-base, rgba(0,0,0,0.18))',
      marginBottom: 8,
      display: 'flex', flexDirection: 'column', gap: 8,
      transition: 'border-color 0.4s, background 0.4s',
    }}>
      {/* Top row: day + class name + remove */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={entry.day}
          onChange={(e) => onChange({ day: e.target.value as DayOfWeek })}
          style={{ ...inputStyle, width: 130 }}
        >
          {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}day</option>)}
        </select>
        <input
          type="text"
          value={entry.class_name}
          onChange={(e) => onChange({ class_name: e.target.value })}
          placeholder="Class name (e.g. All-levels BJJ)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={onRemove}
          style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 700,
            background: 'transparent',
            color: 'var(--bone)',
            border: '1.5px solid var(--bone)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontFamily: "'Inter Tight', sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >Remove</button>
      </div>

      {/* Time row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={miniLabel}>Start</div>
          <input
            type="time"
            value={entry.start_time}
            onChange={(e) => onChange({ start_time: e.target.value })}
            style={{ ...inputStyle, colorScheme: 'light dark', maxWidth: 220 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={miniLabel}>End</div>
          <input
            type="time"
            value={entry.end_time ?? ''}
            onChange={(e) => onChange({ end_time: e.target.value })}
            style={{ ...inputStyle, colorScheme: 'light dark', maxWidth: 220 }}
          />
        </div>
      </div>

      {/* Discipline + level */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180 }}>
          <div style={miniLabel}>Discipline</div>
          <select
            value={entry.discipline}
            onChange={(e) => onChange({ discipline: e.target.value as Discipline })}
            style={{ ...inputStyle, width: '100%' }}
          >
            {DISCIPLINES.map(d => (
              <option key={d} value={d}>
                {DISCIPLINE_LABELS[d]}
                {d === 'gi_bjj' ? ' (Gi)' : ''}
                {d === 'nogi_bjj' ? ' (No-Gi)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={miniLabel}>Level (optional)</div>
          <input
            type="text"
            value={entry.level ?? ''}
            onChange={(e) => onChange({ level: e.target.value })}
            placeholder="All levels / Beginner / Advanced"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={entry.is_open_mat}
            onChange={(e) => onChange({ is_open_mat: e.target.checked })}
          />
          <span><b style={{ color: 'var(--bone)' }}>Open mat</b> — visible in MatFinder&rsquo;s open-mat list</span>
        </label>
        <label style={checkboxLabel}>
          <input
            type="checkbox"
            checked={!!entry.is_kids}
            onChange={(e) => onChange({ is_kids: e.target.checked })}
          />
          <span>Kids class</span>
        </label>
      </div>
    </div>
  );
}

function FieldRow({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={miniLabel}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
  );
}

function CenteredMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      color: 'var(--bone)',
      fontFamily: "'Inter Tight', sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 480 }}>{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared style fragments
// ──────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1.5px solid rgba(245,241,232,0.30)',
  background: 'rgba(0,0,0,0.30)',
  color: 'var(--bone)',
  fontSize: 13,
  fontFamily: "'Inter Tight', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
};

const miniLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
  color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
  fontFamily: "'JetBrains Mono', monospace",
  marginBottom: 3,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.10em',
  color: 'rgba(245,241,232,0.55)', textTransform: 'uppercase',
  fontFamily: "'JetBrains Mono', monospace",
};

const checkboxLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7,
  fontSize: 12, color: 'rgba(245,241,232,0.85)',
  cursor: 'pointer', userSelect: 'none',
  fontFamily: "'Inter Tight', sans-serif",
};

function pillStyle(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '6px 12px',
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
