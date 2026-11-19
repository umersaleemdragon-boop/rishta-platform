import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

export type Lang = 'en' | 'ur';

// NOTE: Urdu strings should be reviewed by a native speaker before launch.
const en = {
  appName: 'Rishta',
  tagline: 'Verified rishtas. Private photos. Families first.',
  continue: 'Continue', back: 'Back', save: 'Save', saveContinue: 'Save & continue', cancel: 'Cancel',
  edit: 'Edit', done: 'Done', loading: 'Loading…', optional: 'optional', required: 'Required',
  yes: 'Yes', no: 'No', any: 'Any', must: 'Must match',
  language: 'اردو',

  // auth
  signInTitle: 'Sign in with your mobile number',
  signInHelp: 'We will send you a 6-digit code. No password needed.',
  phoneLabel: 'Mobile number', phonePlaceholder: '0300 1234567',
  sendCode: 'Send code by SMS', sendWhatsApp: 'Send code on WhatsApp', sendSmsInstead: 'No WhatsApp? Send by SMS',
  verifyHelpWa: 'We sent a 6-digit code on WhatsApp to {phone}.',
  sendFailed: 'We could not send the code right now. Please try again in a few minutes, or contact the bureau.',
  tooManyAttempts: 'Too many attempts. Please wait a minute and try again.', invalidPhone: 'Please enter a valid Pakistani mobile number (03XX XXXXXXX).',
  verifyTitle: 'Enter the code', verifyHelp: 'We sent a 6-digit code to {phone}.',
  codeLabel: 'Verification code', verify: 'Verify', resend: 'Send a new code', changeNumber: 'Change number',
  invalidCode: 'That code is not correct or has expired.',
  backendMissing: 'The app is not connected to the server yet. Add the Supabase URL and key to apps/app/.env.',
  signOut: 'Sign out',

  // home
  welcome: 'Assalam o Alaikum',
  yourNameTitle: 'What is your name?', yourNameHelp: 'Your name is only visible to the bureau team.',
  fullName: 'Full name',
  myProfiles: 'Rishta profiles you manage', noProfiles: 'You have not created a rishta profile yet.',
  createProfile: 'Create a rishta profile', guardedProfiles: 'Profiles you look after (guardian)',
  joinAsGuardian: 'I have a guardian invite code',
  continueProfile: 'Continue profile', viewProfile: 'View profile', manageGuardians: 'Family access',
  completeness: '{n}% complete',
  reviewNote: 'Bureau note: {note}',

  // statuses
  status_draft: 'Draft — not submitted', status_pending_review: 'Waiting for bureau approval',
  status_active: 'Active', status_paused: 'Paused (hidden)', status_matched: 'Rishta confirmed 🎉',
  status_suspended: 'Suspended — contact the bureau', status_deleted: 'Deleted',

  // wizard
  stepOf: 'Step {n} of {total}',
  step_basics: 'Basic details', step_community: 'Religion & community', step_education: 'Education & career',
  step_location: 'Location & lifestyle', step_family: 'Family', step_preferences: 'Partner preferences',
  step_review: 'Privacy & submit',
  whoFor: 'Who is this profile for?',
  firstName: 'First name', firstNameHelp: 'Only the first name is shown to members.',
  gender: 'Gender', dob: 'Date of birth', day: 'DD', month: 'MM', year: 'YYYY',
  maritalStatus: 'Marital status', children: 'Number of children', height: 'Height', feet: 'Feet', inches: 'Inches',
  sect: 'Sect / Maslak', caste: 'Caste / Biradari', motherTongue: 'Mother tongue', religiosity: 'Religious practice',
  hafiz: 'Hafiz-e-Quran',
  educationLevel: 'Highest education', degree: 'Degree / qualification', institution: 'Institution',
  profession: 'Profession / job', income: 'Monthly income (PKR)', incomeHelp: 'Shown to others only as a range.',
  city: 'City', country: 'Country', relocate: 'Willing to relocate after marriage?', smokes: 'Smokes?',
  about: 'About', aboutHelp: 'A few lines about personality, values and plans. Do not write phone numbers.',
  fatherOccupation: "Father's occupation", motherOccupation: "Mother's occupation",
  brothers: 'Brothers', sisters: 'Sisters', marriedSiblings: 'Married siblings',
  familyType: 'Family type', house: 'House', houseSize: 'House size (e.g. 10 marla)',
  familyStatus: 'Family status', familyStatusHelp: 'Used to suggest families with a similar background.',
  familyAbout: 'About the family',
  prefAge: 'Age range', prefHeight: 'Height range (cm)', prefMarital: 'Acceptable marital status',
  prefEducation: 'Minimum education', prefFamilyStatus: 'Minimum family status',
  prefSects: 'Preferred sects', prefCastes: 'Preferred castes', prefCities: 'Preferred cities',
  prefTongues: 'Preferred mother tongues', prefNotes: 'Anything else the family is looking for',
  mustHelp: 'Turn on "Must match" only for true deal-breakers — it hides everyone else.',
  from: 'From', to: 'To',
  privateDetails: 'Private details', privateHelp: 'Never shown to members. Shared only by your choice (Premium contact sharing) or with the bureau team.',
  lastName: 'Last name', contactPhone: 'Contact number', whatsapp: 'WhatsApp number',
  whoCanContact: 'Who can send you interests?',
  submitTitle: 'Submit for bureau approval',
  submitHelp: 'Our team reviews every profile before it is shown to anyone. You will be notified when it is approved.',
  submit: 'Submit profile', submitted: 'Submitted! The bureau will review your profile shortly.',
  photosLater: 'Photos are private by default. You can add them after approval — they are shown only to people you approve.',
  invalidDate: 'Please enter a valid date of birth (18+).',
  fillRequired: 'Please fill in the required fields.',

  // guardians
  guardiansTitle: 'Family access (guardian / wali)',
  guardiansHelp: 'Give a parent or sibling read-only access to this profile and its chats. They sign in with their own number and enter the code.',
  relation: 'Relation', createInvite: 'Create invite code',
  inviteCreated: 'Share this code with your family member. It works once and expires in 7 days:',
  currentGuardians: 'People with access', noGuardians: 'No family members have access yet.',
  pendingInvites: 'Unused codes', revoke: 'Cancel code', removeAccess: 'Remove access',
  redeemTitle: 'Join as a guardian', redeemHelp: 'Enter the 8-character code you received from your family member.',
  inviteCode: 'Invite code', join: 'Join', joined: 'You now have guardian access.',
};

type Dict = typeof en;

const ur: Dict = {
  appName: 'رشتہ',
  tagline: 'تصدیق شدہ رشتے۔ نجی تصاویر۔ خاندان سب سے پہلے۔',
  continue: 'جاری رکھیں', back: 'واپس', save: 'محفوظ کریں', saveContinue: 'محفوظ کر کے آگے بڑھیں', cancel: 'منسوخ',
  edit: 'ترمیم', done: 'مکمل', loading: 'لوڈ ہو رہا ہے…', optional: 'اختیاری', required: 'لازمی',
  yes: 'ہاں', no: 'نہیں', any: 'کوئی بھی', must: 'لازمی شرط',
  language: 'English',

  signInTitle: 'اپنے موبائل نمبر سے سائن اِن کریں',
  signInHelp: 'ہم آپ کو 6 ہندسوں کا کوڈ بھیجیں گے۔ پاس ورڈ کی ضرورت نہیں۔',
  phoneLabel: 'موبائل نمبر', phonePlaceholder: '0300 1234567',
  sendCode: 'SMS پر کوڈ بھیجیں', sendWhatsApp: 'واٹس ایپ پر کوڈ بھیجیں', sendSmsInstead: 'واٹس ایپ نہیں؟ SMS پر بھیجیں',
  verifyHelpWa: 'ہم نے {phone} پر واٹس ایپ کے ذریعے 6 ہندسوں کا کوڈ بھیجا ہے۔',
  sendFailed: 'ابھی کوڈ نہیں بھیجا جا سکا۔ چند منٹ بعد دوبارہ کوشش کریں یا بیورو سے رابطہ کریں۔',
  tooManyAttempts: 'بہت زیادہ کوششیں۔ ایک منٹ بعد دوبارہ کوشش کریں۔', invalidPhone: 'براہِ کرم درست پاکستانی موبائل نمبر درج کریں (03XX XXXXXXX)۔',
  verifyTitle: 'کوڈ درج کریں', verifyHelp: 'ہم نے {phone} پر 6 ہندسوں کا کوڈ بھیجا ہے۔',
  codeLabel: 'تصدیقی کوڈ', verify: 'تصدیق کریں', resend: 'نیا کوڈ بھیجیں', changeNumber: 'نمبر تبدیل کریں',
  invalidCode: 'کوڈ درست نہیں یا اس کی مدت ختم ہو گئی ہے۔',
  backendMissing: 'ایپ ابھی سرور سے منسلک نہیں ہے۔',
  signOut: 'سائن آؤٹ',

  welcome: 'السلام علیکم',
  yourNameTitle: 'آپ کا نام کیا ہے؟', yourNameHelp: 'آپ کا نام صرف بیورو ٹیم دیکھ سکتی ہے۔',
  fullName: 'پورا نام',
  myProfiles: 'آپ کے زیرِ انتظام رشتہ پروفائلز', noProfiles: 'آپ نے ابھی کوئی رشتہ پروفائل نہیں بنایا۔',
  createProfile: 'رشتہ پروفائل بنائیں', guardedProfiles: 'جن پروفائلز کے آپ سرپرست ہیں',
  joinAsGuardian: 'میرے پاس سرپرست کا دعوتی کوڈ ہے',
  continueProfile: 'پروفائل مکمل کریں', viewProfile: 'پروفائل دیکھیں', manageGuardians: 'خاندان کی رسائی',
  completeness: '{n}% مکمل',
  reviewNote: 'بیورو کا نوٹ: {note}',

  status_draft: 'مسودہ — جمع نہیں ہوا', status_pending_review: 'بیورو کی منظوری کا انتظار',
  status_active: 'فعال', status_paused: 'عارضی طور پر چھپا ہوا', status_matched: 'رشتہ طے ہو گیا 🎉',
  status_suspended: 'معطل — بیورو سے رابطہ کریں', status_deleted: 'حذف شدہ',

  stepOf: 'مرحلہ {n} از {total}',
  step_basics: 'بنیادی معلومات', step_community: 'مذہب اور برادری', step_education: 'تعلیم اور پیشہ',
  step_location: 'رہائش اور طرزِ زندگی', step_family: 'خاندان', step_preferences: 'رشتے کی ترجیحات',
  step_review: 'رازداری اور جمع کروانا',
  whoFor: 'یہ پروفائل کس کے لیے ہے؟',
  firstName: 'پہلا نام', firstNameHelp: 'ممبرز کو صرف پہلا نام دکھایا جاتا ہے۔',
  gender: 'جنس', dob: 'تاریخِ پیدائش', day: 'دن', month: 'مہینہ', year: 'سال',
  maritalStatus: 'ازدواجی حیثیت', children: 'بچوں کی تعداد', height: 'قد', feet: 'فٹ', inches: 'انچ',
  sect: 'مسلک', caste: 'ذات / برادری', motherTongue: 'مادری زبان', religiosity: 'دینی رجحان',
  hafiz: 'حافظِ قرآن',
  educationLevel: 'اعلیٰ ترین تعلیم', degree: 'ڈگری', institution: 'ادارہ',
  profession: 'پیشہ / ملازمت', income: 'ماہانہ آمدنی (روپے)', incomeHelp: 'دوسروں کو صرف حد (رینج) دکھائی جاتی ہے۔',
  city: 'شہر', country: 'ملک', relocate: 'شادی کے بعد شہر بدل سکتے ہیں؟', smokes: 'سگریٹ نوشی؟',
  about: 'تعارف', aboutHelp: 'شخصیت، اقدار اور منصوبوں کے بارے میں چند سطریں۔ فون نمبر نہ لکھیں۔',
  fatherOccupation: 'والد کا پیشہ', motherOccupation: 'والدہ کا پیشہ',
  brothers: 'بھائی', sisters: 'بہنیں', marriedSiblings: 'شادی شدہ بہن بھائی',
  familyType: 'خاندانی نظام', house: 'مکان', houseSize: 'مکان کا رقبہ (مثلاً 10 مرلہ)',
  familyStatus: 'خاندانی حیثیت', familyStatusHelp: 'ملتے جلتے پس منظر والے خاندان تجویز کرنے کے لیے۔',
  familyAbout: 'خاندان کا تعارف',
  prefAge: 'عمر کی حد', prefHeight: 'قد کی حد (سینٹی میٹر)', prefMarital: 'قابلِ قبول ازدواجی حیثیت',
  prefEducation: 'کم از کم تعلیم', prefFamilyStatus: 'کم از کم خاندانی حیثیت',
  prefSects: 'ترجیحی مسالک', prefCastes: 'ترجیحی ذاتیں', prefCities: 'ترجیحی شہر',
  prefTongues: 'ترجیحی مادری زبانیں', prefNotes: 'خاندان کی دیگر ترجیحات',
  mustHelp: '"لازمی شرط" صرف اسی صورت میں لگائیں جب یہ واقعی ضروری ہو — اس سے باقی سب چھپ جاتے ہیں۔',
  from: 'سے', to: 'تک',
  privateDetails: 'نجی معلومات', privateHelp: 'ممبرز کو کبھی نہیں دکھائی جاتیں۔ صرف آپ کی اجازت سے (پریمیم) یا بیورو ٹیم کے ساتھ شیئر ہوتی ہیں۔',
  lastName: 'خاندانی نام', contactPhone: 'رابطہ نمبر', whatsapp: 'واٹس ایپ نمبر',
  whoCanContact: 'آپ کو دلچسپی کون بھیج سکتا ہے؟',
  submitTitle: 'بیورو کی منظوری کے لیے جمع کروائیں',
  submitHelp: 'ہماری ٹیم ہر پروفائل کو دکھانے سے پہلے چیک کرتی ہے۔ منظوری پر آپ کو اطلاع ملے گی۔',
  submit: 'پروفائل جمع کروائیں', submitted: 'جمع ہو گیا! بیورو جلد آپ کا پروفائل دیکھے گا۔',
  photosLater: 'تصاویر بطورِ ڈیفالٹ نجی ہیں۔ منظوری کے بعد شامل کریں — یہ صرف انہی کو دکھیں گی جنہیں آپ اجازت دیں۔',
  invalidDate: 'براہِ کرم درست تاریخِ پیدائش درج کریں (18 سال یا زائد)۔',
  fillRequired: 'براہِ کرم لازمی خانے پُر کریں۔',

  guardiansTitle: 'خاندان کی رسائی (سرپرست / ولی)',
  guardiansHelp: 'والدین یا بہن بھائی کو اس پروفائل اور چیٹس تک صرف دیکھنے کی رسائی دیں۔ وہ اپنے نمبر سے سائن اِن کر کے کوڈ درج کریں۔',
  relation: 'رشتہ', createInvite: 'دعوتی کوڈ بنائیں',
  inviteCreated: 'یہ کوڈ اپنے گھر والوں کو دیں۔ یہ ایک بار چلے گا اور 7 دن میں ختم ہو جائے گا:',
  currentGuardians: 'جن کے پاس رسائی ہے', noGuardians: 'ابھی کسی کو رسائی نہیں دی گئی۔',
  pendingInvites: 'غیر استعمال شدہ کوڈ', revoke: 'کوڈ منسوخ کریں', removeAccess: 'رسائی ختم کریں',
  redeemTitle: 'بطور سرپرست شامل ہوں', redeemHelp: 'گھر والوں سے ملا ہوا 8 حروف کا کوڈ درج کریں۔',
  inviteCode: 'دعوتی کوڈ', join: 'شامل ہوں', joined: 'اب آپ کو سرپرست کی رسائی حاصل ہے۔',
};

// Labels for database enum values.
export const ENUM_LABELS: Record<string, Record<string, { en: string; ur: string }>> = {
  managed_by: {
    self: { en: 'Myself', ur: 'اپنے لیے' }, parent: { en: 'My son / daughter', ur: 'بیٹے / بیٹی کے لیے' },
    sibling: { en: 'My brother / sister', ur: 'بھائی / بہن کے لیے' }, relative: { en: 'A relative', ur: 'کسی رشتہ دار کے لیے' },
    bureau: { en: 'Bureau', ur: 'بیورو' },
  },
  gender: { male: { en: 'Male', ur: 'مرد' }, female: { en: 'Female', ur: 'خاتون' } },
  marital_status: {
    never_married: { en: 'Never married', ur: 'غیر شادی شدہ' }, divorced: { en: 'Divorced', ur: 'طلاق یافتہ' },
    widowed: { en: 'Widowed', ur: 'بیوہ / رنڈوا' }, separated: { en: 'Separated', ur: 'علیحدگی' },
  },
  education_level: {
    primary: { en: 'Primary / Middle', ur: 'پرائمری / مڈل' }, matric: { en: 'Matric / O-Levels', ur: 'میٹرک / او لیول' },
    intermediate: { en: 'Intermediate / A-Levels', ur: 'انٹرمیڈیٹ / اے لیول' }, diploma: { en: 'Diploma', ur: 'ڈپلومہ' },
    bachelors: { en: "Bachelor's", ur: 'بیچلرز' }, masters: { en: "Master's", ur: 'ماسٹرز' },
    mphil: { en: 'M.Phil / MS', ur: 'ایم فل / ایم ایس' }, doctorate: { en: 'PhD / Doctorate', ur: 'پی ایچ ڈی' },
  },
  religiosity: {
    liberal: { en: 'Liberal', ur: 'آزاد خیال' }, moderate: { en: 'Moderate', ur: 'معتدل' },
    practising: { en: 'Practising', ur: 'پابندِ شریعت' }, very_religious: { en: 'Very religious', ur: 'بہت دیندار' },
  },
  family_type: { nuclear: { en: 'Nuclear', ur: 'الگ گھرانہ' }, joint: { en: 'Joint family', ur: 'مشترکہ خاندان' } },
  house_ownership: {
    owned: { en: 'Own house', ur: 'ذاتی مکان' }, rented: { en: 'Rented', ur: 'کرائے کا' },
    family_owned: { en: 'Family house', ur: 'خاندانی مکان' },
  },
  socioeconomic_class: {
    lower_middle: { en: 'Lower middle class', ur: 'نچلا متوسط طبقہ' }, middle: { en: 'Middle class', ur: 'متوسط طبقہ' },
    upper_middle: { en: 'Upper middle class', ur: 'اعلیٰ متوسط طبقہ' }, upper: { en: 'Upper class', ur: 'اعلیٰ طبقہ' },
  },
  contact_policy: {
    anyone: { en: 'Any approved member', ur: 'کوئی بھی منظور شدہ ممبر' },
    verified_only: { en: 'Only CNIC-verified members', ur: 'صرف شناختی کارڈ سے تصدیق شدہ ممبرز' },
    premium_only: { en: 'Only Premium members', ur: 'صرف پریمیم ممبرز' },
  },
  relation: {
    father: { en: 'Father', ur: 'والد' }, mother: { en: 'Mother', ur: 'والدہ' }, brother: { en: 'Brother', ur: 'بھائی' },
    sister: { en: 'Sister', ur: 'بہن' }, uncle: { en: 'Uncle', ur: 'چچا / ماموں' }, aunt: { en: 'Aunt', ur: 'خالہ / پھوپھی' },
    grandparent: { en: 'Grandparent', ur: 'دادا / نانا' }, other: { en: 'Other', ur: 'دیگر' },
  },
};

type I18n = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: keyof Dict, vars?: Record<string, string | number>) => string;
  enumLabel: (group: string, value: string | null | undefined) => string;
  isRTL: boolean;
};

const I18nContext = createContext<I18n | null>(null);
const STORAGE_KEY = 'rishta.lang';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => v === 'ur' && setLangState('ur')).catch(() => {});
  }, []);

  useEffect(() => {
    // Web: flip the whole page to right-to-left for Urdu. (Native RTL is handled in Step 9.)
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const t = useCallback<I18n['t']>((key, vars) => {
    let s = (lang === 'ur' ? ur : en)[key] ?? en[key] ?? String(key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  }, [lang]);

  const enumLabel = useCallback<I18n['enumLabel']>((group, value) => {
    if (!value) return '';
    return ENUM_LABELS[group]?.[value]?.[lang] ?? value;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t, enumLabel, isRTL: lang === 'ur' }}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export type TKey = keyof Dict;
