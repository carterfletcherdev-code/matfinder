/**
 * Converts openmattfinder.com API data → Gym[] entries to merge into data.ts
 */
import { readFileSync, writeFileSync } from 'fs';

const raw = JSON.parse(readFileSync('scripts/openmattfinder.json', 'utf8'));

const DISCIPLINE_MAP = {
  'BJJ':        'gi_bjj',
  'MMA':        'mma',
  'Boxing':     'boxing',
  'Kickboxing': 'kickboxing',
  'Muay Thai':  'muay_thai',
  'Wrestling':  'wrestling',
  'Judo':       'judo',
  'No-Gi':      'nogi_bjj',
};

const DAY_MAP = {
  monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday',
  thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday',
  mon: 'monday', tue: 'tuesday', wed: 'wednesday',
  thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday',
};

function parseTime(str) {
  const m = str.trim().match(/^(\d+)(?::(\d+))?\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2] || '00';
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

function parseSchedule(scheduleStr, gymId, disciplines) {
  if (!scheduleStr) return [];
  const mats = [];

  // Split on semicolons (multiple sessions)
  const segments = scheduleStr.split(/[;]/);

  segments.forEach((seg, si) => {
    // Remove notes in parentheses
    const clean = seg.replace(/\([^)]*\)/g, '').trim();

    // Match: DayName start - end or DayName start
    const m = clean.match(/^(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d+(?::\d+)?\s*(?:AM|PM))\s*(?:[–\-]\s*(\d+(?::\d+)?\s*(?:AM|PM)))?/i);
    if (!m) return;

    const day = DAY_MAP[m[1].toLowerCase()];
    const startTime = parseTime(m[2]);
    if (!day || !startTime) return;
    const endTime = m[3] ? parseTime(m[3]) : addTwoHours(startTime);

    disciplines.forEach((disc, di) => {
      mats.push({
        id: `${gymId}-${si + 1}-${di + 1}`,
        discipline: disc,
        day,
        start_time: startTime,
        end_time: endTime,
        is_free: true,
      });
    });
  });

  return mats;
}

// Get current max ID from data.ts
const existingData = readFileSync('lib/data.ts', 'utf8');
const ids = [...existingData.matchAll(/"id": "(\d+)"/g)].map(m => parseInt(m[1]));
let nextId = Math.max(...ids) + 1;

// Filter out test entries and convert
const gyms = raw
  .filter(r => r.approvalStatus === 'approved')
  .filter(r => !r.gymName.toLowerCase().includes('test gym') && !r.gymName.match(/[A-Z]{5,}/))
  .map(r => {
    const disciplines = r.disciplines
      .map(d => DISCIPLINE_MAP[d])
      .filter(Boolean);
    if (disciplines.length === 0) disciplines.push('gi_bjj');

    const id = String(nextId++);
    const mats = parseSchedule(r.schedule, id, disciplines);
    if (mats.length === 0) {
      // Fallback: Saturday noon
      disciplines.forEach((disc, di) => {
        mats.push({ id: `${id}-1-${di+1}`, discipline: disc, day: 'saturday', start_time: '12:00', end_time: '14:00', is_free: true });
      });
    }

    return {
      id,
      name: r.gymName,
      address: r.address || '',
      city: r.city || '',
      state: r.state || '',
      country: 'US',
      lat: parseFloat(parseFloat(r.latitude).toFixed(6)),
      lng: parseFloat(parseFloat(r.longitude).toFixed(6)),
      open_mats: mats,
    };
  })
  .filter(g => g.lat && g.lng && g.open_mats.length > 0);

console.log(`Converted ${gyms.length} gyms from openmattfinder.com`);
const disc = {};
gyms.forEach(g => g.open_mats.forEach(m => { disc[m.discipline] = (disc[m.discipline]||0)+1; }));
console.log('By discipline:', disc);

writeFileSync('scripts/openmattfinder-converted.json', JSON.stringify(gyms, null, 2));
console.log('Saved to scripts/openmattfinder-converted.json');
