// Pakistani mobile numbers: accepts 03001234567, 3001234567, +923001234567,
// 00923001234567, "0300-1234567" -> "+923001234567". Returns null if invalid.
export function normalizePkMobile(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  let local: string;
  if (/^923\d{9}$/.test(digits)) local = digits.slice(2);
  else if (/^03\d{9}$/.test(digits)) local = digits.slice(1);
  else if (/^3\d{9}$/.test(digits)) local = digits;
  else return null;
  return `+92${local}`;
}

export function formatPkMobile(e164: string): string {
  const m = e164.replace(/^\+?92/, '0');
  return m.length === 11 ? `${m.slice(0, 4)}-${m.slice(4)}` : e164;
}

// Supabase/SMS provider errors are technical; show members a friendly message.
export function otpErrorKey(err: { message?: string; status?: number }): 'tooManyAttempts' | 'sendFailed' {
  console.warn('OTP send failed:', err.message);
  return err.status === 429 || /rate limit|too many/i.test(err.message ?? '') ? 'tooManyAttempts' : 'sendFailed';
}

// Pakistani mobile (any common format) or an international number (+44…, 0044…).
export function normalizeAnyMobile(input: string): string | null {
  const pk = normalizePkMobile(input);
  if (pk) return pk;
  const raw = input.trim().replace(/[\s\-().]/g, '');
  const intl = raw.startsWith('+') ? raw.slice(1) : raw.startsWith('00') ? raw.slice(2) : null;
  return intl && /^[1-9]\d{7,14}$/.test(intl) ? `+${intl}` : null;
}
