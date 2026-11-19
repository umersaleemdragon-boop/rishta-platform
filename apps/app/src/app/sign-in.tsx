import { router } from 'expo-router';
import { useState } from 'react';
import { Banner, Button, Card, Field, H1, P, Screen } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { useI18n } from '../lib/i18n';
import { normalizePkMobile } from '../lib/phone';
import { isBackendConfigured, supabase } from '../lib/supabase';

export default function SignIn() {
  const { t } = useI18n();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    const e164 = normalizePkMobile(phone);
    if (!e164) return setError(t('invalidPhone'));
    setError(null); setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (err) return setError(err.message);
    router.push({ pathname: '/verify', params: { phone: e164 } });
  }

  return (
    <Screen>
      <TopBar />
      <H1>{t('signInTitle')}</H1>
      <P muted>{t('tagline')}</P>
      {!isBackendConfigured && <Banner kind="error">{t('backendMissing')}</Banner>}
      <Card>
        <Field label={t('phoneLabel')} required value={phone} onChangeText={setPhone} placeholder={t('phonePlaceholder')}
          keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={16}
          help={t('signInHelp')} error={error} onSubmitEditing={send} testID="phone-input" />
        <Button title={t('sendCode')} onPress={send} loading={busy} disabled={!isBackendConfigured} testID="send-code" />
      </Card>
    </Screen>
  );
}
