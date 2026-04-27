export type Discipline =
  | 'bjj'
  | 'nogi_bjj'
  | 'gi_bjj'
  | 'wrestling'
  | 'judo'
  | 'muay_thai'
  | 'mma'
  | 'kickboxing'
  | 'boxing'
  | 'karate'
  | 'taekwondo';

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface OpenMat {
  id: string;
  discipline: Discipline;
  day: DayOfWeek;
  start_time: string;
  end_time: string;
  is_free: boolean;
  cost?: number;
  notes?: string;
  confirmed?: boolean;
  // Verification metadata from the citation-grounded extraction pipeline.
  // verified=true requires source_url + source_quote that was substring-checked against the page.
  verified?: boolean;
  source_url?: string;
  source_quote?: string;
  verified_at?: string; // ISO timestamp
}

// Full class schedule entry — output of the citation-grounded pipeline.
// Open mats are a filtered view of this list (entries with is_open_mat=true).
export interface ScheduleEntry {
  day: DayOfWeek;
  start_time: string;
  end_time?: string | null;
  class_name: string;
  discipline: Discipline;
  is_open_mat: boolean;
  is_kids?: boolean;
  level?: string;
  // Verification metadata — same contract as OpenMat.
  verified?: boolean;
  source_url?: string;
  source_quote?: string;
  verified_at?: string;
}

export interface GymProvenance {
  places_verified?: boolean;     // Confirmed via Google Places API
  places_id?: string;            // Google Places ID for re-fetching
  website_source?: 'places' | 'osm' | 'manual' | 'community';
  schedule_extracted_at?: string; // ISO timestamp of last extraction run
  extraction_status?: 'verified' | 'no_website' | 'no_schedule_page' | 'scrape_failed' | 'extraction_rejected' | 'unverified_legacy';
}

export type Region =
  | 'all'
  | 'north_america'
  | 'south_america'
  | 'europe'
  | 'asia'
  | 'africa'
  | 'oceania';

export interface Gym {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
  website?: string;
  phone?: string;
  instagram?: string;
  drop_in_friendly?: boolean;
  loaner_gi?: boolean;
  free_for_visitors?: boolean;
  // Featured listings — paid placement at top of list. $50/mo monetization.
  featured?: boolean;
  open_mats: OpenMat[];
  // Full class schedule from the citation-grounded pipeline (Stage 4 output).
  // open_mats[] is the filtered subset (schedule.filter(s => s.is_open_mat)).
  schedule?: ScheduleEntry[];
  provenance?: GymProvenance;
}

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  bjj: 'BJJ',
  nogi_bjj: 'No-Gi BJJ',
  gi_bjj: 'Gi BJJ',
  wrestling: 'Wrestling',
  judo: 'Judo',
  muay_thai: 'Muay Thai',
  mma: 'MMA',
  kickboxing: 'Kickboxing',
  boxing: 'Boxing',
  karate: 'Karate',
  taekwondo: 'Taekwondo',
};

// 11 distinct hues — each one map-friendly (saturated enough to pop on light/dark/satellite map styles).
// No two share a hue family.
export const DISCIPLINE_COLORS: Record<Discipline, { bg: string; text: string; marker: string }> = {
  bjj:        { bg: '#FBF0D4', text: '#5C4515', marker: '#C9A24A' }, // gold
  nogi_bjj:   { bg: '#FEE0C0', text: '#7C2D12', marker: '#EA580C' }, // orange
  gi_bjj:     { bg: '#DBEAFE', text: '#1E3A5F', marker: '#2563EB' }, // royal blue
  wrestling:  { bg: '#DCFCE7', text: '#14532D', marker: '#15803D' }, // forest green
  judo:       { bg: '#FEE2E2', text: '#7F1D1D', marker: '#DC2626' }, // red
  muay_thai:  { bg: '#FCE7F3', text: '#831843', marker: '#DB2777' }, // hot pink
  mma:        { bg: '#EDE9FE', text: '#2E1065', marker: '#6D28D9' }, // deep purple
  kickboxing: { bg: '#CFFAFE', text: '#155E75', marker: '#0891B2' }, // cyan
  boxing:     { bg: '#FEF3C7', text: '#451A03', marker: '#78350F' }, // brown
  karate:     { bg: '#ECFCCB', text: '#365314', marker: '#84CC16' }, // lime
  taekwondo:  { bg: '#E2E8F0', text: '#1E293B', marker: '#475569' }, // slate
};

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export const REGION_BOUNDS: Record<Region, { center: [number, number]; zoom: number }> = {
  all:           { center: [20.0,    0.0], zoom: 2 },
  north_america: { center: [39.5, -98.35], zoom: 3 },
  south_america: { center: [-15.0, -60.0], zoom: 3 },
  europe:        { center: [52.0,   15.0], zoom: 4 },
  asia:          { center: [34.0,  100.0], zoom: 3 },
  africa:        { center: [ 2.0,   20.0], zoom: 3 },
  oceania:       { center: [-25.0, 135.0], zoom: 4 },
};

export const REGION_LABELS: Record<Region, string> = {
  all:           'All',
  north_america: 'North America',
  south_america: 'South America',
  europe:        'Europe',
  asia:          'Asia',
  africa:        'Africa',
  oceania:       'Oceania',
};
