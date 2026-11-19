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
