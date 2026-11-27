import { useCallback } from 'react';
import { useI18n } from './i18n';
import { useLookups } from './lookups';

// Display helpers shared by the member screens.
export function useLabels() {
  const { lang } = useI18n();
  const { options } = useLookups();
  // lookup values are codes ("lahore"); custom typed values are shown as typed
  const lbl = useCallback((category: string, value: string | null | undefined) =>
    value ? options(category, lang).find((o) => o.value === value)?.label ?? value : '', [options, lang]);
  return { lbl };
}

export function heightText(cm: number | null | undefined) {
  if (!cm) return '';
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}′${inches % 12}″`;
}

export const joinDot = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

export function timeAgo(iso: string | null | undefined, lang: 'en' | 'ur') {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return lang === 'ur' ? `${mins} منٹ پہلے` : `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return lang === 'ur' ? `${h} گھنٹے پہلے` : `${h}h ago`;
  const d = Math.round(h / 24);
  return lang === 'ur' ? `${d} دن پہلے` : `${d}d ago`;
}
