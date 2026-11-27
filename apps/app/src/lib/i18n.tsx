import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

export type Lang = 'en' | 'ur';

// NOTE: Urdu strings should be reviewed by a native speaker before launch.
const en = {
  appName: 'Zaujyn',
  tagline: 'Verified rishtas. Private photos. Families first.',
  continue: 'Continue', back: 'Back', save: 'Save', saveContinue: 'Save & continue', cancel: 'Cancel',
  edit: 'Edit', done: 'Done', loading: 'Loading…', optional: 'optional', required: 'Required',
  yes: 'Yes', no: 'No', any: 'Any', must: 'Must match',
  language: 'اردو',

  // auth
  emailSignInTitle: 'Sign in with your email',
  emailLabel: 'Email address', emailPlaceholder: 'name@gmail.com',
  emailHelp: 'We will email you a 6-digit code. No password needed.',
  sendEmailCode: 'Email me a code', invalidEmail: 'Please enter a valid email address.',
  usePhoneInstead: 'Use mobile number instead', useEmailInstead: 'Use email instead',
  verifyHelpEmail: 'We emailed {email}. Enter the code here, or simply tap the sign-in link in that email. Check the Spam folder too.',
  signInTitle: 'Sign in with your mobile number',
  signInHelp: 'We will send you a 6-digit code. No password needed.',
  phoneLabel: 'Mobile number', phonePlaceholder: '0300 1234567',
  sendCode: 'Send code by SMS', sendWhatsApp: 'Send code on WhatsApp', sendSmsInstead: 'No WhatsApp? Send by SMS',
  verifyHelpWa: 'We sent a 6-digit code on WhatsApp to {phone}.',
  sendFailed: 'We could not send the code right now. Please try again in a few minutes, or contact the bureau.',
  tooManyAttempts: 'Too many sign-in emails were requested. Please try again a little later (up to an hour), and use the most recent email you received.', invalidPhone: 'Please enter a valid Pakistani mobile number (03XX XXXXXXX).',
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
  prefAge: 'Age range', prefHeight: 'Height range', prefMarital: 'Acceptable marital status',
  prefEducation: 'Minimum education', prefFamilyStatus: 'Minimum family status',
  prefSects: 'Preferred sects', prefCastes: 'Preferred castes', prefCities: 'Preferred cities',
  prefTongues: 'Preferred mother tongues', prefNotes: 'Anything else the family is looking for',
  mustHelp: 'Turn on "Must match" only for true deal-breakers — it hides everyone else.',
  from: 'From', to: 'To',
  privateDetails: 'Private details', privateHelp: 'Never shown to members. Shared only by your choice (Premium contact sharing) or with the bureau team.',
  lastName: 'Last name', contactPhone: 'Mobile number', whatsapp: 'WhatsApp number',
  whoCanContact: 'Who can send you interests?',
  submitTitle: 'Submit for bureau approval',
  submitHelp: 'Our team reviews every profile before it is shown to anyone. You will be notified when it is approved.',
  submit: 'Submit profile', submitted: 'Submitted! The bureau will review your profile shortly.',
  photosLater: 'Photos are private by default. You can add them after approval — they are shown only to people you approve.',
  invalidDate: 'Please enter a valid date of birth (18+).',
  fillRequired: 'Please fill in the required fields.',

  otherCity: 'Type your city / town', otherCountry: 'Type your country', otherCaste: 'Type your caste / biradari',
  otherSect: 'Type your sect / maslak', otherTongue: 'Type your mother tongue',
  typeOtherRequired: 'You chose "Other" — please type the name in the box below it.',
  ageRangeInvalid: 'Partner age must be between 18 and 80, and "From" cannot be more than "To".',
  heightRangeInvalid: 'Partner height must be between 4 ft and 7 ft 6 in (inches 0–11), and "From" cannot be more than "To".',
  invalidMobile: 'Please enter a valid mobile number, e.g. 0300 1234567 (or +44… if you live abroad).',
  contactPhoneHelp: 'Only Premium members can see it — and only after you approve their request. The bureau team can always see it to help you.',
  whatsappHelp: 'Leave empty if it is the same as your mobile number.',
  // tabs & screens (member app)
  tabMatches: 'Matches', tabInterests: 'Interests', tabChats: 'Chats', tabFamily: 'Family', tabMe: 'Me',
  yourMatches: 'Your matches', matchesSub: 'Families matched on your preferences · refreshed every morning',
  filters: 'Filters', verifiedOnly: 'Verified only', clearFilters: 'Clear', applyFilters: 'Show matches',
  ageFrom: 'Age from', ageTo: 'Age to', anyCity: 'Any city', anySect: 'Any sect',
  bureauSuggestion: 'Bureau suggestion for you', fromMatchmaker: 'from your matchmaker',
  matchPct: '{n}% match', viewProfile2: 'View profile', sendInterest: 'Send interest', interestSent: 'Interest sent ✓',
  photoPrivate: 'Photos are private — request them in chat',
  previewLocked: 'You are seeing a preview. Upgrade to Basic to see full profiles and send interests.',
  seePlans: 'See plans', noMatches: 'No matches yet with these filters. Try widening age or city.',
  needProfile: 'Create your rishta profile to see matches.', profilePending: 'Your profile is waiting for bureau approval — you can browse previews meanwhile.',
  whyMatch: 'Why you match', aboutFamily: 'About & family', lookingFor: 'Looking for', howVerified: 'How we verified this profile',
  verifiedNone: 'Not verified yet', verified_phone: 'Phone verified', verified_cnic: 'CNIC verified', verified_bureau: 'Bureau verified',
  verifyNote: 'Verification helps, but always involve your family before meeting.',
  managedBy: 'Profile managed by: {who}', bureauClient: 'Bureau client — the bureau will contact the family for you',
  interestMessage: 'Add a short note (optional)', interestMessagePh: 'Assalam o Alaikum, our family would like to know more…',
  received: 'Received', sent: 'Sent', accept: 'Accept & chat', notNow: 'Not now', withdraw: 'Withdraw',
  freeCanReply: 'Free members can always accept and reply. Declining is private.',
  noInterests: 'Nothing here yet.', status_i_pending: 'Waiting', status_i_accepted: 'Accepted', status_i_declined: 'Declined', status_i_withdrawn: 'Withdrawn', status_i_expired: 'Expired',
  noChats: 'No conversations yet. When an interest is accepted, the chat appears here.',
  waliPresent: 'Family can read this chat', typeMessage: 'Write a message…', send: 'Send',
  requestPhotos: 'Request photos', sharePhotos: 'Share my photos', revokePhotos: 'Take back photos', propose: 'Propose meeting', shareContact: 'Ask for contact',
  safetyNote: 'For your safety, phone numbers and links can’t be sent in chat.',
  sys_interest_accepted: 'Interest accepted — you can now talk.', sys_photo_requested: 'Photo request sent.', sys_photo_request_approved: 'Photos shared.',
  sys_photo_request_declined: 'Photo request declined.', sys_photos_shared: 'Photos shared.', sys_photo_access_revoked: 'Photo access taken back.',
  sys_contact_requested: 'Contact details requested.', sys_contact_shared: 'Contact details shared.', sys_contact_request_declined: 'Contact request declined.',
  sys_meeting_proposed: 'Meeting proposed.', sys_meeting_scheduled: 'Meeting confirmed.', sys_meeting_declined: 'Meeting declined.', sys_meeting_cancelled: 'Meeting cancelled.', sys_meeting_completed: 'Meeting completed.',
  sys_rishta_confirmation_pending: 'One family has confirmed the rishta.', sys_rishta_confirmed: 'Rishta confirmed — Mubarak! 🎉', sys_conversation_closed: 'This conversation has ended.',
  photoRequestIn: 'asked to see your photos', approve: 'Approve', decline: 'Decline',
  contactRequestIn: 'asked for your contact details', viewContact: 'View contact', contactVia: 'Contact through the bureau',
  meetingTitle: 'Family meeting', meetingType_video_call: 'Video call', meetingType_in_person_family: 'In person, with families',
  meetingWhen: 'Date & time (e.g. 2026-12-05 17:00)', meetingWhere: 'Place or video link', confirm: 'Confirm', cancel2: 'Cancel', markDone: 'Mark as done',
  meetingStatus_requested: 'Waiting for reply', meetingStatus_scheduled: 'Confirmed', meetingStatus_declined: 'Declined', meetingStatus_cancelled: 'Cancelled', meetingStatus_completed: 'Completed',
  confirmRishta: 'Confirm rishta', moreActions: 'More', report: 'Report', block: 'Block', endChat: 'End conversation',
  reportReason: 'What is wrong?', reportSent: 'Thank you — the bureau will review this.',
  viewPhotos: 'View photos', photos: 'Photos', noPhotos: 'No approved photos yet.',
  familyTitle: 'Family', familySub: 'Rishtas are a family matter — follow along together.', lookAfter: 'Profiles you look after',
  readOnly: 'Read-only', noGuarded: 'You are not a guardian of any profile yet.',
  meTitle: 'Me', activeProfile: 'Acting as', switchProfile: 'Switch', myPlan: 'Plan', planFree: 'Free', upgrade: 'Upgrade', staffPanel: 'Bureau admin panel',
  plansTitle: 'Choose a plan', plansSub: 'One payment for 3 months. No auto-renewal, ever.', currentPlan: 'Your plan',
  mostFamilies: 'Most families choose', payWith: 'Pay with', payStep1: '1. Send {amount} to this account', payStep2: '2. Upload the receipt and transaction ID',
  txId: 'Transaction ID (TID)', senderName: 'Sender name', senderAccount: 'Sender number / account', uploadReceipt: 'Upload receipt screenshot', receiptAdded: 'Receipt added ✓',
  submitPayment: 'Submit payment', paymentSubmitted: 'Received! The bureau will check your payment and activate your plan.',
  refundPolicy: 'Full refund within 3 days if you haven’t contacted anyone yet; no refund after your first contact.',
  paymentsHistory: 'Your payments', pay_pending: 'Being checked', pay_approved: 'Approved', pay_rejected: 'Rejected', pay_refunded: 'Refunded',
  myPhotos: 'My photos', photosHelp: 'Photos stay private. Only people you approve in chat can see them, and our team checks every photo first.',
  addPhoto: 'Add photo', makeMain: 'Make main', removePhoto: 'Remove', maxPhotos: 'Up to 6 photos.',
  photo_pending: 'Waiting for bureau check', photo_approved: 'Approved', photo_rejected: 'Not approved',
  getVerified: 'Get verified', verifyCnicTitle: 'Verify with your CNIC',
  verifyCnicHelp: 'Upload both sides of your CNIC and a selfie. Only our verification team can see them, and we keep only a scrambled CNIC number.',
  cnicFront: 'CNIC — front side', cnicBack: 'CNIC — back side', selfie: 'Selfie (face clearly visible)', takeSelfie: 'Take selfie', chooseImage: 'Choose image',
  submitVerification: 'Submit for verification', verificationSubmitted: 'Submitted — our team will check it soon.',
  ver_pending: 'Being checked', ver_approved: 'Verified ✓', ver_rejected: 'Not approved',
  sharedWith: 'Shared privately with {code} — please do not save or forward.',
  imageTooLarge: 'This image is larger than 5 MB. Please choose a smaller one.',
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
  appName: 'زوجین',
  tagline: 'تصدیق شدہ رشتے۔ نجی تصاویر۔ خاندان سب سے پہلے۔',
  continue: 'جاری رکھیں', back: 'واپس', save: 'محفوظ کریں', saveContinue: 'محفوظ کر کے آگے بڑھیں', cancel: 'منسوخ',
  edit: 'ترمیم', done: 'مکمل', loading: 'لوڈ ہو رہا ہے…', optional: 'اختیاری', required: 'لازمی',
  yes: 'ہاں', no: 'نہیں', any: 'کوئی بھی', must: 'لازمی شرط',
  language: 'English',

  emailSignInTitle: 'اپنی ای میل سے سائن اِن کریں',
  emailLabel: 'ای میل ایڈریس', emailPlaceholder: 'name@gmail.com',
  emailHelp: 'ہم آپ کو ای میل پر 6 ہندسوں کا کوڈ بھیجیں گے۔ پاس ورڈ کی ضرورت نہیں۔',
  sendEmailCode: 'ای میل پر کوڈ بھیجیں', invalidEmail: 'براہِ کرم درست ای میل ایڈریس درج کریں۔',
  usePhoneInstead: 'موبائل نمبر استعمال کریں', useEmailInstead: 'ای میل استعمال کریں',
  verifyHelpEmail: 'ہم نے {email} پر ای میل بھیجی ہے۔ کوڈ یہاں درج کریں، یا ای میل میں موجود سائن اِن لنک پر کلک کریں۔ اسپیم فولڈر بھی چیک کریں۔',
  signInTitle: 'اپنے موبائل نمبر سے سائن اِن کریں',
  signInHelp: 'ہم آپ کو 6 ہندسوں کا کوڈ بھیجیں گے۔ پاس ورڈ کی ضرورت نہیں۔',
  phoneLabel: 'موبائل نمبر', phonePlaceholder: '0300 1234567',
  sendCode: 'SMS پر کوڈ بھیجیں', sendWhatsApp: 'واٹس ایپ پر کوڈ بھیجیں', sendSmsInstead: 'واٹس ایپ نہیں؟ SMS پر بھیجیں',
  verifyHelpWa: 'ہم نے {phone} پر واٹس ایپ کے ذریعے 6 ہندسوں کا کوڈ بھیجا ہے۔',
  sendFailed: 'ابھی کوڈ نہیں بھیجا جا سکا۔ چند منٹ بعد دوبارہ کوشش کریں یا بیورو سے رابطہ کریں۔',
  tooManyAttempts: 'بہت زیادہ سائن اِن ای میلز مانگی گئی ہیں۔ کچھ دیر بعد (ایک گھنٹے تک) دوبارہ کوشش کریں، اور سب سے نئی ای میل استعمال کریں۔', invalidPhone: 'براہِ کرم درست پاکستانی موبائل نمبر درج کریں (03XX XXXXXXX)۔',
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
  prefAge: 'عمر کی حد', prefHeight: 'قد کی حد', prefMarital: 'قابلِ قبول ازدواجی حیثیت',
  prefEducation: 'کم از کم تعلیم', prefFamilyStatus: 'کم از کم خاندانی حیثیت',
  prefSects: 'ترجیحی مسالک', prefCastes: 'ترجیحی ذاتیں', prefCities: 'ترجیحی شہر',
  prefTongues: 'ترجیحی مادری زبانیں', prefNotes: 'خاندان کی دیگر ترجیحات',
  mustHelp: '"لازمی شرط" صرف اسی صورت میں لگائیں جب یہ واقعی ضروری ہو — اس سے باقی سب چھپ جاتے ہیں۔',
  from: 'سے', to: 'تک',
  privateDetails: 'نجی معلومات', privateHelp: 'ممبرز کو کبھی نہیں دکھائی جاتیں۔ صرف آپ کی اجازت سے (پریمیم) یا بیورو ٹیم کے ساتھ شیئر ہوتی ہیں۔',
  lastName: 'خاندانی نام', contactPhone: 'موبائل نمبر', whatsapp: 'واٹس ایپ نمبر',
  whoCanContact: 'آپ کو دلچسپی کون بھیج سکتا ہے؟',
  submitTitle: 'بیورو کی منظوری کے لیے جمع کروائیں',
  submitHelp: 'ہماری ٹیم ہر پروفائل کو دکھانے سے پہلے چیک کرتی ہے۔ منظوری پر آپ کو اطلاع ملے گی۔',
  submit: 'پروفائل جمع کروائیں', submitted: 'جمع ہو گیا! بیورو جلد آپ کا پروفائل دیکھے گا۔',
  photosLater: 'تصاویر بطورِ ڈیفالٹ نجی ہیں۔ منظوری کے بعد شامل کریں — یہ صرف انہی کو دکھیں گی جنہیں آپ اجازت دیں۔',
  invalidDate: 'براہِ کرم درست تاریخِ پیدائش درج کریں (18 سال یا زائد)۔',
  fillRequired: 'براہِ کرم لازمی خانے پُر کریں۔',

  otherCity: 'اپنا شہر / قصبہ لکھیں', otherCountry: 'اپنا ملک لکھیں', otherCaste: 'اپنی ذات / برادری لکھیں',
  otherSect: 'اپنا مسلک لکھیں', otherTongue: 'اپنی مادری زبان لکھیں',
  typeOtherRequired: 'آپ نے "دیگر" منتخب کیا ہے — براہِ کرم نیچے والے خانے میں نام لکھیں۔',
  ageRangeInvalid: 'رشتے کی عمر 18 سے 80 کے درمیان ہو، اور "سے" کی عمر "تک" سے زیادہ نہ ہو۔',
  heightRangeInvalid: 'رشتے کا قد 4 فٹ سے 7 فٹ 6 انچ کے درمیان ہو (انچ 0 سے 11)، اور "سے" کا قد "تک" سے زیادہ نہ ہو۔',
  invalidMobile: 'براہِ کرم درست موبائل نمبر درج کریں، مثلاً 0300 1234567 (بیرونِ ملک ہوں تو +44…)۔',
  contactPhoneHelp: 'یہ نمبر صرف پریمیم ممبرز دیکھ سکتے ہیں — اور وہ بھی آپ کی منظوری کے بعد۔ بیورو ٹیم آپ کی مدد کے لیے ہمیشہ دیکھ سکتی ہے۔',
  whatsappHelp: 'اگر موبائل نمبر والا ہی ہے تو خالی چھوڑ دیں۔',
  tabMatches: 'رشتے', tabInterests: 'دلچسپیاں', tabChats: 'گفتگو', tabFamily: 'خاندان', tabMe: 'میں',
  yourMatches: 'آپ کے رشتے', matchesSub: 'آپ کی ترجیحات کے مطابق · ہر صبح نئے رشتے',
  filters: 'فلٹر', verifiedOnly: 'صرف تصدیق شدہ', clearFilters: 'صاف کریں', applyFilters: 'رشتے دکھائیں',
  ageFrom: 'عمر سے', ageTo: 'عمر تک', anyCity: 'کوئی بھی شہر', anySect: 'کوئی بھی مسلک',
  bureauSuggestion: 'بیورو کی تجویز آپ کے لیے', fromMatchmaker: 'آپ کے میچ میکر کی طرف سے',
  matchPct: '{n}% مطابقت', viewProfile2: 'پروفائل دیکھیں', sendInterest: 'دلچسپی بھیجیں', interestSent: 'دلچسپی بھیج دی گئی ✓',
  photoPrivate: 'تصاویر نجی ہیں — گفتگو میں درخواست کریں',
  previewLocked: 'آپ مختصر جھلک دیکھ رہے ہیں۔ مکمل پروفائل اور دلچسپی بھیجنے کے لیے بیسک پلان لیں۔',
  seePlans: 'پلان دیکھیں', noMatches: 'ان فلٹرز کے ساتھ ابھی کوئی رشتہ نہیں۔ عمر یا شہر بڑھا کر دیکھیں۔',
  needProfile: 'رشتے دیکھنے کے لیے اپنا پروفائل بنائیں۔', profilePending: 'آپ کا پروفائل بیورو کی منظوری کا منتظر ہے — تب تک آپ جھلک دیکھ سکتے ہیں۔',
  whyMatch: 'آپ کیوں موزوں ہیں', aboutFamily: 'تعارف اور خاندان', lookingFor: 'رشتے کی ترجیحات', howVerified: 'ہم نے اس پروفائل کی تصدیق کیسے کی',
  verifiedNone: 'ابھی تصدیق نہیں ہوئی', verified_phone: 'فون تصدیق شدہ', verified_cnic: 'شناختی کارڈ تصدیق شدہ', verified_bureau: 'بیورو سے تصدیق شدہ',
  verifyNote: 'تصدیق مددگار ہے، لیکن ملاقات سے پہلے ہمیشہ اپنے خاندان کو شامل کریں۔',
  managedBy: 'پروفائل کا انتظام: {who}', bureauClient: 'بیورو کلائنٹ — بیورو آپ کے لیے خاندان سے رابطہ کرے گا',
  interestMessage: 'مختصر پیغام (اختیاری)', interestMessagePh: 'السلام علیکم، ہمارا خاندان مزید جاننا چاہتا ہے…',
  received: 'موصول', sent: 'بھیجی گئیں', accept: 'قبول کریں اور بات کریں', notNow: 'ابھی نہیں', withdraw: 'واپس لیں',
  freeCanReply: 'مفت ممبرز ہمیشہ قبول اور جواب دے سکتے ہیں۔ انکار نجی رہتا ہے۔',
  noInterests: 'ابھی یہاں کچھ نہیں۔', status_i_pending: 'منتظر', status_i_accepted: 'قبول', status_i_declined: 'انکار', status_i_withdrawn: 'واپس', status_i_expired: 'مدت ختم',
  noChats: 'ابھی کوئی گفتگو نہیں۔ دلچسپی قبول ہونے پر گفتگو یہاں آئے گی۔',
  waliPresent: 'خاندان یہ گفتگو پڑھ سکتا ہے', typeMessage: 'پیغام لکھیں…', send: 'بھیجیں',
  requestPhotos: 'تصاویر کی درخواست', sharePhotos: 'اپنی تصاویر دکھائیں', revokePhotos: 'تصاویر واپس لیں', propose: 'ملاقات تجویز کریں', shareContact: 'رابطہ نمبر مانگیں',
  safetyNote: 'آپ کی حفاظت کے لیے گفتگو میں فون نمبر اور لنک نہیں بھیجے جا سکتے۔',
  sys_interest_accepted: 'دلچسپی قبول ہو گئی — اب بات کریں۔', sys_photo_requested: 'تصاویر کی درخواست بھیج دی گئی۔', sys_photo_request_approved: 'تصاویر دکھا دی گئیں۔',
  sys_photo_request_declined: 'تصاویر کی درخواست مسترد۔', sys_photos_shared: 'تصاویر دکھا دی گئیں۔', sys_photo_access_revoked: 'تصاویر کی رسائی واپس لے لی گئی۔',
  sys_contact_requested: 'رابطہ تفصیلات مانگی گئیں۔', sys_contact_shared: 'رابطہ تفصیلات شیئر ہو گئیں۔', sys_contact_request_declined: 'رابطہ درخواست مسترد۔',
  sys_meeting_proposed: 'ملاقات تجویز کی گئی۔', sys_meeting_scheduled: 'ملاقات طے ہو گئی۔', sys_meeting_declined: 'ملاقات مسترد۔', sys_meeting_cancelled: 'ملاقات منسوخ۔', sys_meeting_completed: 'ملاقات ہو گئی۔',
  sys_rishta_confirmation_pending: 'ایک خاندان نے رشتے کی تصدیق کر دی ہے۔', sys_rishta_confirmed: 'رشتہ طے ہو گیا — مبارک ہو! 🎉', sys_conversation_closed: 'یہ گفتگو ختم ہو گئی ہے۔',
  photoRequestIn: 'نے آپ کی تصاویر دیکھنے کی درخواست کی ہے', approve: 'منظور', decline: 'انکار',
  contactRequestIn: 'نے آپ کا رابطہ نمبر مانگا ہے', viewContact: 'رابطہ دیکھیں', contactVia: 'بیورو کے ذریعے رابطہ کریں',
  meetingTitle: 'خاندانی ملاقات', meetingType_video_call: 'ویڈیو کال', meetingType_in_person_family: 'خاندانوں کے ساتھ ملاقات',
  meetingWhen: 'تاریخ اور وقت (مثلاً 2026-12-05 17:00)', meetingWhere: 'جگہ یا ویڈیو لنک', confirm: 'تصدیق کریں', cancel2: 'منسوخ', markDone: 'مکمل ہو گئی',
  meetingStatus_requested: 'جواب کا انتظار', meetingStatus_scheduled: 'طے شدہ', meetingStatus_declined: 'مسترد', meetingStatus_cancelled: 'منسوخ', meetingStatus_completed: 'مکمل',
  confirmRishta: 'رشتہ طے کریں', moreActions: 'مزید', report: 'شکایت', block: 'بلاک', endChat: 'گفتگو ختم کریں',
  reportReason: 'کیا مسئلہ ہے؟', reportSent: 'شکریہ — بیورو اس کا جائزہ لے گا۔',
  viewPhotos: 'تصاویر دیکھیں', photos: 'تصاویر', noPhotos: 'ابھی کوئی منظور شدہ تصویر نہیں۔',
  familyTitle: 'خاندان', familySub: 'رشتہ خاندان کا معاملہ ہے — مل کر ساتھ چلیں۔', lookAfter: 'جن پروفائلز کے آپ سرپرست ہیں',
  readOnly: 'صرف پڑھنے کے لیے', noGuarded: 'آپ ابھی کسی پروفائل کے سرپرست نہیں۔',
  meTitle: 'میں', activeProfile: 'بطور', switchProfile: 'تبدیل کریں', myPlan: 'پلان', planFree: 'مفت', upgrade: 'اپ گریڈ', staffPanel: 'بیورو ایڈمن پینل',
  plansTitle: 'پلان منتخب کریں', plansSub: '3 ماہ کے لیے ایک ادائیگی۔ کبھی خودکار تجدید نہیں۔', currentPlan: 'آپ کا پلان',
  mostFamilies: 'زیادہ تر خاندانوں کی پسند', payWith: 'ادائیگی کا طریقہ', payStep1: '1۔ اس اکاؤنٹ میں {amount} بھیجیں', payStep2: '2۔ رسید اور ٹرانزیکشن آئی ڈی اپلوڈ کریں',
  txId: 'ٹرانزیکشن آئی ڈی (TID)', senderName: 'بھیجنے والے کا نام', senderAccount: 'بھیجنے والے کا نمبر / اکاؤنٹ', uploadReceipt: 'رسید کا اسکرین شاٹ اپلوڈ کریں', receiptAdded: 'رسید شامل ✓',
  submitPayment: 'ادائیگی جمع کروائیں', paymentSubmitted: 'موصول! بیورو ادائیگی چیک کر کے آپ کا پلان فعال کر دے گا۔',
  refundPolicy: 'اگر آپ نے ابھی کسی سے رابطہ نہیں کیا تو 3 دن کے اندر مکمل رقم واپس؛ پہلے رابطے کے بعد واپسی نہیں۔',
  paymentsHistory: 'آپ کی ادائیگیاں', pay_pending: 'جانچ جاری', pay_approved: 'منظور', pay_rejected: 'مسترد', pay_refunded: 'واپس',
  myPhotos: 'میری تصاویر', photosHelp: 'تصاویر نجی رہتی ہیں۔ صرف وہی دیکھ سکتے ہیں جنہیں آپ گفتگو میں اجازت دیں، اور ہماری ٹیم ہر تصویر پہلے چیک کرتی ہے۔',
  addPhoto: 'تصویر شامل کریں', makeMain: 'مرکزی بنائیں', removePhoto: 'ہٹائیں', maxPhotos: 'زیادہ سے زیادہ 6 تصاویر۔',
  photo_pending: 'بیورو کی جانچ کا انتظار', photo_approved: 'منظور', photo_rejected: 'منظور نہیں',
  getVerified: 'تصدیق کروائیں', verifyCnicTitle: 'شناختی کارڈ سے تصدیق',
  verifyCnicHelp: 'شناختی کارڈ کے دونوں رخ اور ایک سیلفی اپلوڈ کریں۔ صرف ہماری تصدیقی ٹیم انہیں دیکھ سکتی ہے، اور ہم شناختی کارڈ نمبر صرف خفیہ شکل میں رکھتے ہیں۔',
  cnicFront: 'شناختی کارڈ — سامنے کا رخ', cnicBack: 'شناختی کارڈ — پیچھے کا رخ', selfie: 'سیلفی (چہرہ واضح ہو)', takeSelfie: 'سیلفی لیں', chooseImage: 'تصویر منتخب کریں',
  submitVerification: 'تصدیق کے لیے جمع کروائیں', verificationSubmitted: 'جمع ہو گیا — ہماری ٹیم جلد چیک کرے گی۔',
  ver_pending: 'جانچ جاری', ver_approved: 'تصدیق شدہ ✓', ver_rejected: 'منظور نہیں',
  sharedWith: '{code} کے ساتھ نجی طور پر شیئر — براہِ کرم محفوظ یا آگے نہ بھیجیں۔',
  imageTooLarge: 'یہ تصویر 5 MB سے بڑی ہے۔ براہِ کرم چھوٹی تصویر منتخب کریں۔',
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
  report_reason: {
    fake_profile: { en: 'Fake profile', ur: 'جعلی پروفائل' }, agent_or_middleman: { en: 'Agent / middleman', ur: 'ایجنٹ / درمیانی شخص' },
    harassment: { en: 'Harassment', ur: 'ہراسانی' }, asking_for_money: { en: 'Asking for money', ur: 'پیسے مانگ رہا ہے' },
    inappropriate_content: { en: 'Inappropriate content', ur: 'نامناسب مواد' }, already_married: { en: 'Already married', ur: 'پہلے سے شادی شدہ' },
    other: { en: 'Other', ur: 'دیگر' },
  },
  income_band: {
    under_50k: { en: 'Under PKR 50k / month', ur: '50 ہزار سے کم ماہانہ' }, '50k_100k': { en: 'PKR 50k–100k / month', ur: '50 ہزار – 1 لاکھ ماہانہ' },
    '100k_200k': { en: 'PKR 100k–200k / month', ur: '1 – 2 لاکھ ماہانہ' }, '200k_500k': { en: 'PKR 200k–500k / month', ur: '2 – 5 لاکھ ماہانہ' },
    '500k_plus': { en: 'PKR 500k+ / month', ur: '5 لاکھ سے زائد ماہانہ' },
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
