import { router } from 'expo-router';
import { useState } from 'react';
import { TopBar } from '../../components/TopBar';
import { Banner, Button, Card, Field, H1, Screen } from '../../components/ui';
import { useI18n } from '../../lib/i18n';
import { friendlyError } from '../../lib/profile';
import { supabase } from '../../lib/supabase';

export default function RedeemGuardianInvite() {
  const { t, lang } = useI18n();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function redeem() {
    setBusy(true); setError(null);
    const { error: err } = await supabase.rpc('redeem_guardian_invite', { p_code: code });
    setBusy(false);
    if (err) return setError(friendlyError(err, lang));
    setDone(true);
  }

  return (
    <Screen>
      <TopBar back />
      <H1>{t('redeemTitle')}</H1>
      {done ? (
        <>
          <Banner kind="success">{t('joined')}</Banner>
          <Button title={t('done')} onPress={() => router.replace('/')} />
        </>
      ) : (
        <Card>
          <Field label={t('inviteCode')} required value={code} help={t('redeemHelp')} error={error}
            onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            autoCapitalize="characters" autoCorrect={false} maxLength={8} testID="invite-code" />
          <Button title={t('join')} onPress={redeem} loading={busy} disabled={code.length !== 8} />
        </Card>
      )}
    </Screen>
  );
}
