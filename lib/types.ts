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
  // True when discipline was confirmed from explicit source (gym name keywords, scraped website, etc.)
  // False/undefined means it's an inferred default ("bjj" unknown).
  confirmed?: boolean;
}

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
  open_mats: OpenMat[];
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

export const DISCIPLINE_COLORS: Record<Discipline, { bg: string; text: string; marker: string }> = {
  bjj:        { bg: '#FBF0D4', text: '#5C4515', marker: '#C9A24A' },
  nogi_bjj:   { bg: '#FEE0C0', text: '#7C2D12', marker: '#F97316' },
  gi_bjj:     { bg: '#DBEAFE', text: '#1E3A5F', marker: '#3B82F6' },
  wrestling:  { bg: '#DCFCE7', text: '#14532D', marker: '#22C55E' },
  judo:       { bg: '#FEE2E2', text: '#7F1D1D', marker: '#EF4444' },
  muay_thai:  { bg: '#FCE7F3', text: '#831843', marker: '#EC4899' },
  mma:        { bg: '#EDE9FE', text: '#2E1065', marker: '#8B5CF6' },
  kickboxing: { bg: '#FEF3C7', text: '#78350F', marker: '#F59E0B' },
  boxing:     { bg: '#FFE4E6', text: '#881337', marker: '#F43F5E' },
  karate:     { bg: '#ECFDF5', text: '#065F46', marker: '#10B981' },
  taekwondo:  { bg: '#F0F9FF', text: '#0C4A6E', marker: '#0EA5E9' },
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

export const REGION_BOUNDS = {
  us:     { center: [39.5, -98.35] as [number, number], zoom: 4 },
  europe: { center: [52.0,  15.0]  as [number, number], zoom: 4 },
  all:    { center: [30.0, -30.0]  as [number, number], zoom: 2 },
};
