export type Discipline =
  | 'nogi_bjj'
  | 'gi_bjj'
  | 'wrestling'
  | 'judo'
  | 'muay_thai'
  | 'mma'
  | 'kickboxing'
  | 'boxing';

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
  open_mats: OpenMat[];
}

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  nogi_bjj: 'No-Gi BJJ',
  gi_bjj: 'Gi BJJ',
  wrestling: 'Wrestling',
  judo: 'Judo',
  muay_thai: 'Muay Thai',
  mma: 'MMA',
  kickboxing: 'Kickboxing',
  boxing: 'Boxing',
};

export const DISCIPLINE_COLORS: Record<Discipline, { bg: string; text: string }> = {
  nogi_bjj:   { bg: '#DCC8B4', text: '#3E2E20' },
  gi_bjj:     { bg: '#C8D4DC', text: '#1F3040' },
  wrestling:  { bg: '#D4DCCC', text: '#2A3820' },
  judo:       { bg: '#DCCCC0', text: '#3A2A1A' },
  muay_thai:  { bg: '#DCCCC8', text: '#3A1A1A' },
  mma:        { bg: '#C8C8DC', text: '#20203A' },
  kickboxing: { bg: '#DCD4C8', text: '#382A1A' },
  boxing:     { bg: '#DCCCD4', text: '#381A28' },
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
