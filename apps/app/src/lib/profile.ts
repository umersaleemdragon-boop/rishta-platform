import { errorMessage } from '@rishta/shared';
import { supabase } from './supabase';
import type { Lang } from './i18n';

export type Profile = {
  id: string; public_code: string; owner_user_id: string | null; status: string; review_note: string | null;
  completeness: number; verification_level: string;
  managed_by: string; first_name: string; gender: 'male' | 'female'; date_of_birth: string;
  marital_status: string; children_count: number; height_cm: number | null;
  sect: string | null; caste: string | null; mother_tongue: string | null; religiosity: string | null; is_hafiz: boolean;
  education_level: string | null; degree_title: string | null; institution: string | null; profession: string | null;
  monthly_income_pkr: number | null;
  city: string | null; country: string; willing_to_relocate: boolean; smokes: boolean | null; about: string | null;
  father_occupation: string | null; mother_occupation: string | null; brothers_count: number; sisters_count: number;
  married_siblings: number; family_type: string | null; house_ownership: string | null; house_size: string | null;
  socioeconomic_class: string | null; family_about: string | null; contact_policy: string;
};

export type PrivateDetails = { profile_id: string; last_name: string | null; contact_phone: string | null; whatsapp_number: string | null };

export type Preferences = {
  profile_id: string; age_min: number | null; age_max: number | null; height_min_cm: number | null; height_max_cm: number | null;
  marital_statuses: string[]; education_min: string | null; socioeconomic_min: string | null;
  sects: string[]; sect_is_must: boolean; castes: string[]; caste_is_must: boolean;
  cities: string[]; city_is_must: boolean; mother_tongues: string[]; notes: string | null;
};

// Columns a user may write (others are bureau-controlled; gender is fixed after creation).
export const EDITABLE_PROFILE_FIELDS = [
  'managed_by', 'first_name', 'date_of_birth', 'marital_status', 'children_count', 'height_cm',
  'sect', 'caste', 'mother_tongue', 'religiosity', 'is_hafiz',
  'education_level', 'degree_title', 'institution', 'profession', 'monthly_income_pkr',
  'city', 'country', 'willing_to_relocate', 'smokes', 'about',
  'father_occupation', 'mother_occupation', 'brothers_count', 'sisters_count', 'married_siblings',
  'family_type', 'house_ownership', 'house_size', 'socioeconomic_class', 'family_about', 'contact_policy',
] as const;

export function pick<T extends object>(obj: Partial<T>, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = (obj as Record<string, unknown>)[k];
  return out;
}

export async function loadProfileBundle(id: string) {
  const [p, priv, prefs] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('profile_private').select('profile_id,last_name,contact_phone,whatsapp_number').eq('profile_id', id).single(),
    supabase.from('partner_preferences').select('*').eq('profile_id', id).single(),
  ]);
  if (p.error) throw p.error;
  return { profile: p.data as Profile, priv: (priv.data ?? { profile_id: id }) as PrivateDetails, prefs: prefs.data as Preferences };
}

export function friendlyError(err: { message?: string } | null | undefined, lang: Lang) {
  const msg = err?.message ?? '';
  // Postgres check-constraint / RLS messages -> generic text; known codes -> translated
  const known = errorMessage({ message: msg }, lang);
  if (!/Something went wrong|کچھ غلط/.test(known)) return known;
  if (/row-level security|permission denied/.test(msg)) return errorMessage({ message: 'not_authorized' }, lang);
  return known;
}

// --- height helpers ---
export const cmToFtIn = (cm: number | null | undefined) => {
  if (!cm) return { ft: '', inch: '' };
  const totalIn = Math.round(cm / 2.54);
  return { ft: String(Math.floor(totalIn / 12)), inch: String(totalIn % 12) };
};
export const ftInToCm = (ft: string, inch: string) => {
  const f = parseInt(ft, 10), i = parseInt(inch || '0', 10);
  if (Number.isNaN(f) || f < 4 || f > 7 || Number.isNaN(i) || i < 0 || i > 11) return null;
  return Math.round((f * 12 + i) * 2.54);
};

// --- date helpers ---
export function buildDob(d: string, m: string, y: string): string | null {
  const day = parseInt(d, 10), mon = parseInt(m, 10), yr = parseInt(y, 10);
  if (!day || !mon || !yr || yr < 1940) return null;
  const date = new Date(Date.UTC(yr, mon - 1, day));
  if (date.getUTCFullYear() !== yr || date.getUTCMonth() !== mon - 1 || date.getUTCDate() !== day) return null;
  const eighteen = new Date(); eighteen.setFullYear(eighteen.getFullYear() - 18);
  if (date > eighteen) return null;
  return `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const toInt = (v: string) => { const n = parseInt(v.replace(/[^\d]/g, ''), 10); return Number.isNaN(n) ? null : n; };
