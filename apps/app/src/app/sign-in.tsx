import { router } from 'expo-router';
import { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Banner, Button, Card, Field, H1, P, Screen } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { normalizePkMobile, otpErrorKey } from '../lib/phone';
import { emailRedirectTo, isBackendConfigured, loginMethods, otpChannels, supabase, type LoginMethod, type OtpChannel } from '../lib/supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignIn() {
  const { t } = useI18n();
  const methods: LoginMethod[] = loginMethods.length ? loginMethods : ['email'];
  const [method, setMethod] = useState<LoginMethod>(methods[0]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const channels: OtpChannel[] = otpChannels.length ? otpChannels : ['sms'];

  async function sendEmail() {
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) return setError(t('invalidEmail'));
    setError(null); setBusy('email');
    const { error: err } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true, emailRedirectTo } });
    setBusy(null);
    if (err) return setError(t(otpErrorKey(err)));
    router.push({ pathname: '/verify', params: { email: addr } });
  }

  async function sendPhone(channel: OtpChannel) {
    const e164 = normalizePkMobile(phone);
    if (!e164) return setError(t('invalidPhone'));
    setError(null); setBusy(channel);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164, options: { channel } });
    setBusy(null);
    if (err) return setError(t(otpErrorKey(err)));
    router.push({ pathname: '/verify', params: { phone: e164, channel } });
  }

  const other = methods.find((m) => m !== method);

  return (
    <Screen>
      <TopBar />
      <H1>{method === 'email' ? t('emailSignInTitle') : t('signInTitle')}</H1>
      <P muted>{t('tagline')}</P>
      {!isBackendConfigured && <Banner kind="error">{t('backendMissing')}</Banner>}
      <Card>
        {method === 'email' ? (
          <>
            <Field label={t('emailLabel')} required value={email} onChangeText={setEmail} placeholder={t('emailPlaceholder')}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
              textContentType="emailAddress" maxLength={200} help={t('emailHelp')} error={error}
              onSubmitEditing={sendEmail} testID="email-input" />
            <Button title={t('sendEmailCode')} onPress={sendEmail} loading={busy === 'email'}
              disabled={!isBackendConfigured} testID="send-email" />
          </>
        ) : (
          <>
            <Field label={t('phoneLabel')} required value={phone} onChangeText={setPhone} placeholder={t('phonePlaceholder')}
              keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={16}
              help={t('signInHelp')} error={error} onSubmitEditing={() => sendPhone(channels[0])} testID="phone-input" />
            {channels.map((c, i) => (
              <Button key={c} testID={`send-${c}`} variant={i === 0 ? 'primary' : 'ghost'}
                title={c === 'whatsapp' ? t('sendWhatsApp') : i === 0 ? t('sendCode') : t('sendSmsInstead')}
                onPress={() => sendPhone(c)} loading={busy === c} disabled={!isBackendConfigured || (busy !== null && busy !== c)} />
            ))}
          </>
        )}
        {other && (
          <Button variant="ghost" title={other === 'phone' ? t('usePhoneInstead') : t('useEmailInstead')}
            onPress={() => { setError(null); setMethod(other); }} />
        )}
      </Card>
    </Screen>
  );
}
