import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Button, Card, Field, H1, Screen } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { formatPkMobile, otpErrorKey } from '../lib/phone';
import { emailRedirectTo, supabase } from '../lib/supabase';

export default function Verify() {
  const { t } = useI18n();
  const { phone, email, channel = 'sms' } =
    useLocalSearchParams<{ phone?: string; email?: string; channel?: 'sms' | 'whatsapp' }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  if (!phone && !email) { router.replace('/sign-in'); return null; }

  async function verify() {
    // Supabase email codes are 6 digits by default (configurable up to 10).
    if (!/^\d{6,10}$/.test(code)) return setError(t('invalidCode'));
    setError(null); setBusy(true);
    const { error: err } = email
      ? await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
      : await supabase.auth.verifyOtp({ phone: phone!, token: code, type: 'sms' });
    setBusy(false);
    if (err) return setError(t('invalidCode'));
    router.replace('/');
  }

  async function resend() {
    setResent(false);
    const { error: err } = email
      ? await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo } })
      : await supabase.auth.signInWithOtp({ phone: phone!, options: { channel } });
    if (err) setError(t(otpErrorKey(err))); else setResent(true);
  }

  const help = email
    ? t('verifyHelpEmail', { email })
    : t(channel === 'whatsapp' ? 'verifyHelpWa' : 'verifyHelp', { phone: formatPkMobile(phone!) });

  return (
    <Screen>
      <TopBar back />
      <H1>{t('verifyTitle')}</H1>
      <Card>
        <Field label={t('codeLabel')} required value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 10))}
          keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10}
          help={help} error={error} onSubmitEditing={verify} testID="code-input" />
        <Button title={t('verify')} onPress={verify} loading={busy} testID="verify" />
        <Button title={resent ? '✓ ' + t('resend') : t('resend')} variant="ghost" onPress={resend} />
        <Button title={email ? t('back') : t('changeNumber')} variant="ghost" onPress={() => router.replace('/sign-in')} />
      </Card>
    </Screen>
  );
}
