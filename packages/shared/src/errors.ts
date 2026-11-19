// Stable error codes raised by the database RPC functions -> user-facing text.
export const ERROR_MESSAGES: Record<string, { en: string; ur: string }> = {
  not_authorized: { en: 'You are not allowed to do this.', ur: 'آپ کو اس کی اجازت نہیں ہے۔' },
  not_found: { en: 'This profile is no longer available.', ur: 'یہ پروفائل اب دستیاب نہیں ہے۔' },
  upgrade_required: { en: 'Please upgrade your plan to use this feature.', ur: 'اس سہولت کے لیے اپنا پلان اپ گریڈ کریں۔' },
  profile_not_active: { en: 'Your profile must be approved by the bureau first.', ur: 'پہلے بیورو آپ کا پروفائل منظور کرے گا۔' },
  profile_incomplete: { en: 'Please complete city, education, height and sect first.', ur: 'پہلے شہر، تعلیم، قد اور مسلک مکمل کریں۔' },
  daily_limit_reached: { en: 'You have reached today’s interest limit.', ur: 'آج کی حد پوری ہو گئی ہے۔' },
  contact_policy_restricted: { en: 'This person only accepts interests from verified / premium members.', ur: 'یہ فرد صرف تصدیق شدہ / پریمیم ممبرز سے رابطہ قبول کرتا ہے۔' },
  contact_info_not_allowed: { en: 'For your safety, phone numbers and social links can’t be shared in chat. Use “Share contact” instead.', ur: 'حفاظت کے لیے چیٹ میں نمبر یا لنک شیئر نہیں کیے جا سکتے۔ “رابطہ شیئر کریں” استعمال کریں۔' },
  interest_already_exists: { en: 'An interest is already pending between you.', ur: 'آپ کے درمیان پہلے سے دلچسپی زیرِ التوا ہے۔' },
  already_connected: { en: 'You are already connected — open the chat.', ur: 'آپ پہلے سے منسلک ہیں — چیٹ کھولیں۔' },
  conversation_closed: { en: 'This conversation has ended.', ur: 'یہ گفتگو ختم ہو چکی ہے۔' },
  already_requested: { en: 'You have already sent this request.', ur: 'آپ یہ درخواست پہلے ہی بھیج چکے ہیں۔' },
  photo_access_required: { en: 'Photos are private until the person approves your request.', ur: 'تصاویر منظوری کے بعد ہی دکھائی دیں گی۔' },
  contact_not_shared: { en: 'Contact details are shared only after approval.', ur: 'رابطہ تفصیلات منظوری کے بعد ہی ملیں گی۔' },
  duplicate_transaction: { en: 'This transaction ID / receipt has already been used.', ur: 'یہ ٹرانزیکشن آئی ڈی / رسید پہلے استعمال ہو چکی ہے۔' },
  must_be_18_or_older: { en: 'Candidates must be at least 18 years old.', ur: 'امیدوار کی عمر کم از کم 18 سال ہونی چاہیے۔' },
  invalid_state: { en: 'This request has already been handled.', ur: 'اس درخواست پر پہلے ہی کارروائی ہو چکی ہے۔' },
  invalid_input: { en: 'Please check the details and try again.', ur: 'تفصیلات چیک کر کے دوبارہ کوشش کریں۔' },
  contact_info_in_profile: { en: 'Please remove phone numbers, emails and social links from your profile text. Contacts are shared only with your approval.', ur: 'براہِ کرم پروفائل سے فون نمبر، ای میل اور سوشل لنکس ہٹا دیں۔ رابطہ صرف آپ کی اجازت سے شیئر ہوتا ہے۔' },
  field_locked: { en: 'This detail can only be changed by the bureau team.', ur: 'یہ معلومات صرف بیورو ٹیم تبدیل کر سکتی ہے۔' },
  invalid_status_change: { en: 'This change is not allowed.', ur: 'یہ تبدیلی ممکن نہیں۔' },
  profile_limit_reached: { en: 'You can manage up to 5 profiles.', ur: 'آپ زیادہ سے زیادہ 5 پروفائل بنا سکتے ہیں۔' },
  invalid_invite: { en: 'This code is not valid, already used, or expired.', ur: 'یہ کوڈ درست نہیں، استعمال ہو چکا ہے یا ختم ہو گیا ہے۔' },
  too_many_invites: { en: 'You already have 5 unused codes. Cancel one first.', ur: 'آپ کے پاس پہلے ہی 5 غیر استعمال شدہ کوڈ ہیں۔' },
  guardian_limit_reached: { en: 'A profile can have up to 4 family members with access.', ur: 'ایک پروفائل کو زیادہ سے زیادہ 4 افراد رسائی رکھ سکتے ہیں۔' },
};

export function errorMessage(err: { message?: string } | null | undefined, lang: 'en' | 'ur' = 'en'): string {
  const code = err?.message ?? '';
  return ERROR_MESSAGES[code]?.[lang] ?? (lang === 'ur' ? 'کچھ غلط ہو گیا۔' : 'Something went wrong.');
}
