import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, Card, Field, H1, Screen } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { useI18n } from '../lib/i18n';
import { formatPkMobile } from '../lib/phone';
import { supabase } from '../lib/supabase';

export default function Verify() {
  const { t } = useI18n();
  const { phone, channel = 'sms' } = useLocalSearchParams<{ phone: string; channel?: 'sms' | 'whatsapp' }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  if (!phone) { router.replace('/sign-in'); return null; }

  async function verify() {
    if (!/^\d{6}$/.test(code)) return setError(t('invalidCode'));
    setError(null); setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    setBusy(false);
    if (err) return setError(t('invalidCode'));
    router.replace('/');
  }

  async function resend() {
    setResent(false);
    const { error: err } = await supabase.auth.signInWithOtp({ phone, options: { channel } });
    if (err) setError(err.message); else setResent(true);
  }

  return (
    <Screen>
      <TopBar back />
      <H1>{t('verifyTitle')}</H1>
      <Card>
        <Field label={t('codeLabel')} required value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6}
          help={t(channel === 'whatsapp' ? 'verifyHelpWa' : 'verifyHelp', { phone: formatPkMobile(phone) })} error={error} onSubmitEditing={verify} testID="code-input" />
        <Button title={t('verify')} onPress={verify} loading={busy} testID="verify" />
        <Button title={resent ? '✓ ' + t('resend') : t('resend')} variant="ghost" onPress={resend} />
        <Button title={t('changeNumber')} variant="ghost" onPress={() => router.replace('/sign-in')} />
      </Card>
    </Screen>
  );
}
