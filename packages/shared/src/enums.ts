// Mirrors the PostgreSQL enums in supabase/migrations/20261119000100_foundation.sql.
// (Step 2 will add generated types via `supabase gen types typescript`.)

export const GENDERS = ['male', 'female'] as const;
export const MARITAL_STATUSES = ['never_married', 'divorced', 'widowed', 'separated'] as const;
export const MANAGED_BY = ['self', 'parent', 'sibling', 'relative', 'bureau'] as const;
export const PROFILE_STATUSES = ['draft', 'pending_review', 'active', 'paused', 'matched', 'suspended', 'deleted'] as const;
export const VERIFICATION_LEVELS = ['none', 'phone', 'cnic', 'bureau'] as const;
export const EDUCATION_LEVELS = ['primary', 'matric', 'intermediate', 'diploma', 'bachelors', 'masters', 'mphil', 'doctorate'] as const;
export const SOCIOECONOMIC_CLASSES = ['lower_middle', 'middle', 'upper_middle', 'upper'] as const;
export const RELIGIOSITY = ['liberal', 'moderate', 'practising', 'very_religious'] as const;
export const FAMILY_TYPES = ['nuclear', 'joint'] as const;
export const HOUSE_OWNERSHIP = ['owned', 'rented', 'family_owned'] as const;
export const CONTACT_POLICIES = ['anyone', 'verified_only', 'premium_only'] as const;
export const STAFF_ROLES = ['super_admin', 'verifier', 'matchmaker', 'accountant'] as const;
export const PAYMENT_METHODS = ['jazzcash', 'easypaisa', 'bank_transfer', 'card', 'cash'] as const;
export const PAYMENT_STATUSES = ['pending', 'approved', 'rejected', 'refunded'] as const;
export const INTEREST_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn', 'expired'] as const;
export const ACCESS_STATUSES = ['pending', 'approved', 'declined', 'revoked'] as const;
export const CONNECTION_STAGES = ['chatting', 'meeting_planned', 'rishta_confirmed', 'engaged', 'married', 'closed'] as const;
export const MEETING_TYPES = ['video_call', 'in_person_family'] as const;
export const MEETING_STATUSES = ['requested', 'scheduled', 'declined', 'cancelled', 'completed'] as const;
export const REPORT_REASONS = ['fake_profile', 'agent_or_middleman', 'harassment', 'asking_for_money', 'inappropriate_content', 'already_married', 'other'] as const;

export type Gender = (typeof GENDERS)[number];
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];
export type SocioeconomicClass = (typeof SOCIOECONOMIC_CLASSES)[number];
export type Religiosity = (typeof RELIGIOSITY)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ConnectionStage = (typeof CONNECTION_STAGES)[number];
export type MeetingType = (typeof MEETING_TYPES)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];
