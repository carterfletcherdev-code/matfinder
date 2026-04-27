/**
 * Converts findanopenmat.com pin data → our Gym[] format
 * Outputs: lib/data-scraped.ts
 */
import { readFileSync, writeFileSync } from 'fs';

const raw = JSON.parse(readFileSync('scripts/captured.json', 'utf8'));
const pins = raw.find(d => d.url.includes('pins')).body;

const DAY_MAP = {
  monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday',
  thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday',
};

function parseTime(timeStr) {
  // "10:00 AM" → "10:00", "1:30 PM" → "13:30"
  const m = timeStr.trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function addTwoHours(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const total = h * 60 + m + 120;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function titleCase(str) {
  if (!str) return '';
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function parseCity(cityField) {
  // "kansas city, mo" → city part only (state is separate field)
  if (!cityField) return '';
  const parts = cityField.split(',');
  return titleCase(parts[0].trim());
}

function stateFromPin(pin) {
  if (pin.state) return pin.state.toUpperCase().trim();
  // Sometimes embedded in city field
  if (pin.city && pin.city.includes(',')) {
    return pin.city.split(',')[1].trim().toUpperCase();
  }
  return 'US';
}

// Returns { disciplines: string[], confirmed: boolean }
// Confirmed = we explicitly matched gi/no-gi or another non-BJJ discipline
function inferDisciplines(gymName) {
  const n = gymName.toLowerCase();
  const disciplines = [];
  let confirmed = false;

  if (/\bmuay.thai\b/.test(n))                       { disciplines.push('muay_thai');  confirmed = true; }
  if (/\bkickbox/.test(n))                            { disciplines.push('kickboxing'); confirmed = true; }
  if (/\bbox(?:ing)?\b/.test(n) && !/\bkickbox/.test(n)) { disciplines.push('boxing');  confirmed = true; }
  if (/\bjudo\b/.test(n))                             { disciplines.push('judo');       confirmed = true; }
  if (/\bwrestling\b/.test(n))                        { disciplines.push('wrestling');  confirmed = true; }
  if (/\bmma\b/.test(n))                              { disciplines.push('mma');        confirmed = true; }
  if (/\bno.?gi\b|\bgrappling\b|\bsubmission\b/.test(n)) { disciplines.push('nogi_bjj'); confirmed = true; }
  // "Gi" is only a confirmed signal if it appears as a standalone word and not preceded by "no"
  if (/(^|[^a-z])gi\b/.test(n) && !/no.?gi/.test(n))     { disciplines.push('gi_bjj');   confirmed = true; }

  // Default fallback — generic BJJ (gi/no-gi unknown)
  if (disciplines.length === 0) disciplines.push('bjj');

  return { disciplines: [...new Set(disciplines)], confirmed };
}

function parseSchedule(pin, gymId) {
  const mats = [];
  const dayAndTime = pin.dayAndTime || '';
  const { disciplines, confirmed } = inferDisciplines(pin.name || pin.gym || '');

  // Split multiple sessions: "Friday 7:00 PM, Saturday 11:00 AM"
  const sessions = dayAndTime.split(/,\s*(?=[A-Z])/);

  sessions.forEach((session, si) => {
    const parts = session.trim().split(/\s+/);
    if (parts.length < 3) return;

    const dayStr = parts[0].toLowerCase();
    const timeStr = parts.slice(1).join(' ');

    if (!DAY_MAP[dayStr]) return;
    const startTime = parseTime(timeStr);
    if (!startTime) return;

    disciplines.forEach((discipline, di) => {
      mats.push({
        id: `${gymId}-${si + 1}-${di + 1}`,
        discipline,
        day: DAY_MAP[dayStr],
        start_time: startTime,
        end_time: addTwoHours(startTime),
        is_free: true,
        confirmed,
      });
    });
  });

  return mats;
}

const gyms = pins
  .filter(p => p.latitude && p.longitude && p.name)
  .map((pin, idx) => {
    const id = String(idx + 1);
    const schedule = parseSchedule(pin, id);
    if (schedule.length === 0) return null;

    const city = parseCity(pin.city);
    const state = stateFromPin(pin);

    return {
      id,
      name: titleCase(pin.name || pin.gym),
      address: '',
      city,
      state,
      country: 'US',
      lat: parseFloat(pin.latitude.toFixed(6)),
      lng: parseFloat(pin.longitude.toFixed(6)),
      open_mats: schedule,
    };
  })
  .filter(Boolean);

console.log(`Converted ${gyms.length} gyms with valid schedules (out of ${pins.length} total)`);

// Preview state distribution
const byState = {};
gyms.forEach(g => { byState[g.state] = (byState[g.state] || 0) + 1; });
const topStates = Object.entries(byState).sort((a,b)=>b[1]-a[1]).slice(0,10);
console.log('Top states:', topStates.map(([s,n])=>`${s}:${n}`).join(', '));

// Write TypeScript output
const tsContent = `import { Gym } from './types';

// Auto-generated from findanopenmat.com — ${gyms.length} US open mat locations
// Discipline defaults to gi_bjj; discipline-specific filtering can be enhanced with gym name matching
export const GYMS: Gym[] = ${JSON.stringify(gyms, null, 2)};
`;

writeFileSync('lib/data.ts', tsContent);
console.log(`✓ Wrote ${gyms.length} gyms to lib/data.ts`);
