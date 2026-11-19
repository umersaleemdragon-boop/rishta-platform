import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TopBar } from '../../components/TopBar';
import { Banner, Button, Card, Field, H1, H2, Loading, P, Row, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useI18n, type TKey } from '../../lib/i18n';
import { friendlyError, type Profile } from '../../lib/profile';
import { supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';

type Guarded = { profile_id: string; public_code: string; first_name: string; relation: string; status: string };

export default function Home() {
  const { t, lang, enumLabel } = useI18n();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [guarded, setGuarded] = useState<Guarded[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [me, mine, g] = await Promise.all([
      supabase.from('app_users').select('full_name').eq('id', userId).single(),
      supabase.from('profiles').select('*').eq('owner_user_id', userId).neq('status', 'deleted').order('created_at'),
      supabase.rpc('list_my_guarded_profiles'),
    ]);
    if (mine.error) setError(friendlyError(mine.error, lang));
    setFullName(me.data?.full_name ?? null);
    setProfiles((mine.data ?? []) as Profile[]);
    setGuarded((g.data ?? []) as Guarded[]);
    setLoading(false);
  }, [userId, lang]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function saveName() {
    const name = nameInput.trim();
    if (name.length < 2 || !userId) return;
    const { error: err } = await supabase.from('app_users').update({ full_name: name }).eq('id', userId);
    if (err) setError(friendlyError(err, lang)); else setFullName(name);
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <TopBar />
      <H1>{t('welcome')}{fullName ? `, ${fullName.split(' ')[0]}` : ''}</H1>
      {error && <Banner kind="error">{error}</Banner>}

      {!fullName && (
        <Card>
          <H2>{t('yourNameTitle')}</H2>
          <Field label={t('fullName')} required value={nameInput} onChangeText={setNameInput} help={t('yourNameHelp')}
            autoComplete="name" maxLength={120} testID="full-name" />
          <Button title={t('save')} onPress={saveName} disabled={nameInput.trim().length < 2} />
        </Card>
      )}

      <H2>{t('myProfiles')}</H2>
      {profiles.length === 0 && <P muted>{t('noProfiles')}</P>}
      {profiles.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.name}>{p.first_name}</Text>
              <Text style={styles.code}>{p.public_code} · {enumLabel('managed_by', p.managed_by)}</Text>
            </View>
            <StatusPill status={p.status} label={t(`status_${p.status}` as TKey)} />
          </Row>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${p.completeness}%` }]} /></View>
          <P muted>{t('completeness', { n: p.completeness })}</P>
          {p.status === 'draft' && p.review_note ? <Banner kind="error">{t('reviewNote', { note: p.review_note })}</Banner> : null}
          <Row>
            <View style={{ flexGrow: 1 }}>
              <Button title={p.status === 'draft' ? t('continueProfile') : t('edit')}
                onPress={() => router.push(`/profile/${p.id}/edit`)} testID={`edit-${p.public_code}`} />
            </View>
            <View style={{ flexGrow: 1 }}>
              <Button title={t('manageGuardians')} variant="secondary" onPress={() => router.push(`/profile/${p.id}/guardians`)} />
            </View>
          </Row>
        </Card>
      ))}
      <Button title={`+ ${t('createProfile')}`} variant={profiles.length ? 'secondary' : 'primary'}
        onPress={() => router.push('/profile/new')} disabled={profiles.length >= 5} testID="create-profile" />

      {guarded.length > 0 && (
        <>
          <H2>{t('guardedProfiles')}</H2>
          {guarded.map((g) => (
            <Card key={g.profile_id}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={styles.name}>{g.first_name}</Text>
                  <Text style={styles.code}>{g.public_code} · {enumLabel('relation', g.relation)}</Text>
                </View>
                <StatusPill status={g.status} label={t(`status_${g.status}` as TKey)} />
              </Row>
            </Card>
          ))}
        </>
      )}

      <Button title={t('joinAsGuardian')} variant="ghost" onPress={() => router.push('/guardian')} />
      <Button title={t('signOut')} variant="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const tone = status === 'active' || status === 'matched' ? colors.success
    : status === 'suspended' ? colors.danger : status === 'pending_review' ? colors.accent : colors.muted;
  return (
    <View style={[styles.pill, { borderColor: tone }]}>
      <Text style={[styles.pillText, { color: tone }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  code: { fontSize: 13, color: colors.muted, marginTop: 2 },
  pill: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
  pillText: { fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.chip, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.accent },
});
