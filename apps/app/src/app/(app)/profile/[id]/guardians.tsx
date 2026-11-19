import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TopBar } from '../../../../components/TopBar';
import { Banner, Button, Card, ChipSelect, H1, H2, P, Row, Screen } from '../../../../components/ui';
import { ENUM_LABELS, useI18n } from '../../../../lib/i18n';
import { friendlyError } from '../../../../lib/profile';
import { supabase } from '../../../../lib/supabase';
import { colors, radius, space } from '../../../../lib/theme';

type Guardian = { user_id: string; relation: string; created_at: string };
type Invite = { id: string; code: string; relation: string; expires_at: string; redeemed_at: string | null; revoked_at: string | null };

export default function Guardians() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, enumLabel } = useI18n();
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [relation, setRelation] = useState<string | null>('mother');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [g, i] = await Promise.all([
      supabase.from('profile_guardians').select('user_id,relation,created_at').eq('profile_id', id),
      supabase.from('guardian_invites').select('id,code,relation,expires_at,redeemed_at,revoked_at').eq('profile_id', id)
        .is('redeemed_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('created_at'),
    ]);
    setGuardians((g.data ?? []) as Guardian[]);
    setInvites((i.data ?? []) as Invite[]);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function createInvite() {
    if (!relation) return;
    setBusy(true); setError(null); setNewCode(null);
    const { data, error: err } = await supabase.rpc('create_guardian_invite', { p_profile: id, p_relation: relation });
    setBusy(false);
    if (err) return setError(friendlyError(err, lang));
    setNewCode((data as { code: string }).code);
    load();
  }

  async function revoke(inviteId: string) {
    const { error: err } = await supabase.rpc('revoke_guardian_invite', { p_invite: inviteId });
    if (err) setError(friendlyError(err, lang)); else load();
  }

  async function remove(userId: string) {
    const { error: err } = await supabase.from('profile_guardians').delete().eq('profile_id', id).eq('user_id', userId);
    if (err) setError(friendlyError(err, lang)); else load();
  }

  const relations = Object.entries(ENUM_LABELS.relation).map(([value, l]) => ({ value, label: l[lang] }));

  return (
    <Screen>
      <TopBar back />
      <H1>{t('guardiansTitle')}</H1>
      <P muted>{t('guardiansHelp')}</P>
      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <ChipSelect label={t('relation')} options={relations} value={relation} onChange={setRelation} required />
        <Button title={t('createInvite')} onPress={createInvite} loading={busy} testID="create-invite" />
        {newCode && (
          <View style={{ gap: space(2) }}>
            <P>{t('inviteCreated')}</P>
            <Text selectable style={styles.code} testID="invite-code-display">{newCode.slice(0, 4)} {newCode.slice(4)}</Text>
          </View>
        )}
      </Card>

      <H2>{t('currentGuardians')}</H2>
      {guardians.length === 0 ? <P muted>{t('noGuardians')}</P> : guardians.map((g) => (
        <Card key={g.user_id}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <P>{enumLabel('relation', g.relation)}</P>
            <Button title={t('removeAccess')} variant="ghost" onPress={() => remove(g.user_id)} />
          </Row>
        </Card>
      ))}

      {invites.length > 0 && (
        <>
          <H2>{t('pendingInvites')}</H2>
          {invites.map((i) => (
            <Card key={i.id}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <P>{i.code} · {enumLabel('relation', i.relation)}</P>
                <Button title={t('revoke')} variant="ghost" onPress={() => revoke(i.id)} />
              </Row>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 32, fontWeight: '800', letterSpacing: 4, textAlign: 'center', color: colors.primary,
    backgroundColor: colors.infoBg, borderRadius: radius.md, paddingVertical: space(4) },
});
