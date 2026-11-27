import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Icon, Tag } from '../../../components/kit';
import { TopBar } from '../../../components/TopBar';
import { Banner, Button, Card, Field, H1, H2, P, Row, Screen } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { useI18n, type TKey } from '../../../lib/i18n';
import { friendlyError } from '../../../lib/profile';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

export default function Me() {
  const { t, lang, enumLabel } = useI18n();
  const { session } = useAuth();
  const { fullName, profiles, active, setActiveId, entitlements, staffRole, refresh } = useSession();
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function saveName() {
    const name = nameInput.trim();
    if (name.length < 2 || !session) return;
    const { error: err } = await supabase.from('app_users').update({ full_name: name }).eq('id', session.user.id);
    if (err) setError(friendlyError(err, lang)); else refresh();
  }

  const tier = entitlements?.tier ?? 'free';
  const tierLabel = tier === 'free' ? t('planFree') : tier === 'basic' ? 'Basic' : 'Premium';

  return (
    <Screen>
      <TopBar />
      <H1>{t('welcome')}{fullName ? `, ${fullName.split(' ')[0]}` : ''}</H1>
      {error && <Banner kind="error">{error}</Banner>}

      {!fullName && (
        <Card>
          <H2>{t('yourNameTitle')}</H2>
          <Field label={t('fullName')} required value={nameInput} onChangeText={setNameInput} help={t('yourNameHelp')} autoComplete="name" maxLength={120} />
          <Button title={t('save')} onPress={saveName} disabled={nameInput.trim().length < 2} />
        </Card>
      )}

      {staffRole && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/admin')} style={styles.staff}>
          <Icon name="shield-checkmark" color="#E9C766" size={22} />
          <Text style={styles.staffText}>{t('staffPanel')}</Text>
          <Icon name="chevron-forward" color="#fff" />
        </Pressable>
      )}

      {active && (
        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={styles.label}>{t('myPlan')} · {active.first_name}</Text>
              <Text style={styles.plan}>{tierLabel}</Text>
              {entitlements?.plan_ends_at && <P muted>→ {new Date(entitlements.plan_ends_at).toLocaleDateString()}</P>}
            </View>
            {tier !== 'premium' && <Button title={t('upgrade')} onPress={() => router.push('/plans')} />}
          </Row>
        </Card>
      )}

      <H2>{t('myProfiles')}</H2>
      {profiles.length === 0 && <P muted>{t('noProfiles')}</P>}
      {profiles.map((p) => (
        <Card key={p.id} style={active?.id === p.id && profiles.length > 1 ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
          <Row style={{ alignItems: 'center' }}>
            <Avatar name={p.first_name} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.first_name}</Text>
              <Text style={styles.code}>{p.public_code} · {enumLabel('managed_by', p.managed_by)}</Text>
            </View>
            <Tag label={t(`status_${p.status}` as TKey)}
              tone={p.status === 'active' || p.status === 'matched' ? 'green' : p.status === 'suspended' ? 'red' : p.status === 'pending_review' ? 'gold' : 'grey'} />
          </Row>
          <View style={styles.track}><View style={[styles.fill, { width: `${p.completeness}%` }]} /></View>
          <P muted>{t('completeness', { n: p.completeness })}</P>
          {p.status === 'draft' && p.review_note ? <Banner kind="error">{t('reviewNote', { note: p.review_note })}</Banner> : null}
          <Row>
            <View style={{ flexGrow: 1 }}><Button title={p.status === 'draft' ? t('continueProfile') : t('edit')} onPress={() => router.push(`/profile/${p.id}/edit`)} /></View>
            <View style={{ flexGrow: 1 }}><Button title={t('manageGuardians')} variant="secondary" onPress={() => router.push(`/profile/${p.id}/guardians`)} /></View>
          </Row>
          <Row>
            <View style={{ flexGrow: 1 }}><Button title={t('myPhotos')} variant="secondary" onPress={() => router.push(`/profile/${p.id}/photos`)} /></View>
            {p.verification_level !== 'cnic' && p.verification_level !== 'bureau' && (
              <View style={{ flexGrow: 1 }}><Button title={t('getVerified')} variant="secondary" onPress={() => router.push(`/profile/${p.id}/verify`)} /></View>
            )}
          </Row>
          {profiles.length > 1 && active?.id !== p.id && (
            <Button title={`${t('activeProfile')}: ${p.first_name}`} variant="ghost" onPress={() => setActiveId(p.id)} />
          )}
        </Card>
      ))}
      <Button title={`+ ${t('createProfile')}`} variant={profiles.length ? 'secondary' : 'primary'}
        onPress={() => router.push('/profile/new')} disabled={profiles.length >= 5} />
      <Button title={t('joinAsGuardian')} variant="ghost" onPress={() => router.push('/guardian')} />
      <Button title={t('signOut')} variant="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  staff: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: colors.primary, borderRadius: radius.lg, padding: space(4) },
  staffText: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  plan: { fontSize: 22, fontWeight: '800', color: colors.primary },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  code: { fontSize: 13, color: colors.muted, marginTop: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.chip, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.accent },
});
