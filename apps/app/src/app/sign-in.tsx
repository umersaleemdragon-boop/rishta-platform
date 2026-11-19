import { router } from 'expo-router';
import { useState } from 'react';
import { Banner, Button, Card, Field, H1, P, Screen } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { useI18n } from '../lib/i18n';
import { normalizePkMobile } from '../lib/phone';
import { isBackendConfigured, otpChannels, supabase, type OtpChannel } from '../lib/supabase';

export default function SignIn() {
  const { t } = useI18n();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'sms' | 'whatsapp' | null>(null);
  const channels: OtpChannel[] = otpChannels.length ? otpChannels : ['sms'];

  async function send(channel: 'sms' | 'whatsapp') {
    const e164 = normalizePkMobile(phone);
    if (!e164) return setError(t('invalidPhone'));
    setError(null); setBusy(channel);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164, options: { channel } });
    setBusy(null);
    if (err) return setError(err.message);
    router.push({ pathname: '/verify', params: { phone: e164, channel } });
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
          help={t('signInHelp')} error={error} onSubmitEditing={() => send(channels[0])} testID="phone-input" />
        {channels.map((c, i) => (
          <Button key={c} testID={`send-${c}`} variant={i === 0 ? 'primary' : 'ghost'}
            title={c === 'whatsapp' ? t('sendWhatsApp') : i === 0 ? t('sendCode') : t('sendSmsInstead')}
            onPress={() => send(c)} loading={busy === c} disabled={!isBackendConfigured || (busy !== null && busy !== c)} />
        ))}
      </Card>
    </Screen>
  );
}
