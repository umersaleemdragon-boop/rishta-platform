import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, EmptyState, Segmented, Tag } from '../../../components/kit';
import { TopBar } from '../../../components/TopBar';
import { Banner, Button, H1, P, Row, Screen } from '../../../components/ui';
import { joinDot, timeAgo, useLabels } from '../../../lib/format';
import { useI18n, type TKey } from '../../../lib/i18n';
import { friendlyError } from '../../../lib/profile';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

type Row = {
  interest_id: string; status: string; message: string | null; created_at: string;
  other_profile_id: string; other_public_code: string; other_first_name: string; other_age: number; other_city: string | null;
  other_education: string | null; other_profession: string | null; other_verification: string;
};

export default function Interests() {
  const { t, lang, enumLabel } = useI18n();
  const { lbl } = useLabels();
  const { active } = useSession();
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!active) { setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase.rpc('list_interests', { p_profile: active.id, p_direction: tab });
    if (err) setError(friendlyError(err, lang));
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [active, tab, lang]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function respond(r: Row, accept: boolean) {
    setBusy(r.interest_id); setError(null);
    const { data, error: err } = await supabase.rpc('respond_interest', { p_interest: r.interest_id, p_accept: accept });
    setBusy(null);
    if (err) { setError(friendlyError(err, lang)); return; }
    if (accept && data) router.push(`/chat/${data}`); else load();
  }
  async function withdraw(r: Row) {
    setBusy(r.interest_id);
    const { error: err } = await supabase.rpc('withdraw_interest', { p_interest: r.interest_id });
    setBusy(null);
    if (err) setError(friendlyError(err, lang)); else load();
  }

  return (
    <Screen>
      <TopBar />
      <H1>{t('tabInterests')}</H1>
      <Segmented value={tab} onChange={setTab}
        options={[{ value: 'received', label: t('received') }, { value: 'sent', label: t('sent') }]} />
      {error && <Banner kind="error">{error}</Banner>}
      {loading && <ActivityIndicator color={colors.primary} />}
      {!loading && rows.length === 0 && <EmptyState icon="heart-outline" text={t('noInterests')} />}

      {rows.map((r) => (
        <View key={r.interest_id} style={styles.card}>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/member/${r.other_profile_id}`)}>
            <Row style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
              <Avatar name={r.other_first_name} size={52} locked />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <Text style={styles.name} numberOfLines={1}>{r.other_first_name}, {r.other_age}</Text>
                  <Text style={styles.time}>{timeAgo(r.created_at, lang)}</Text>
                </Row>
                <Text style={styles.sub}>{joinDot(r.other_profession || enumLabel('education_level', r.other_education), lbl('city', r.other_city))}</Text>
              </View>
            </Row>
          </Pressable>
          {r.message && <Text style={styles.msg}>“{r.message}”</Text>}
          {r.status === 'pending' && tab === 'received' ? (
            <>
              <Row>
                <View style={{ flex: 1 }}><Button title={t('notNow')} variant="secondary" onPress={() => respond(r, false)} disabled={busy === r.interest_id} /></View>
                <View style={{ flex: 1.3 }}><Button title={t('accept')} onPress={() => respond(r, true)} loading={busy === r.interest_id} /></View>
              </Row>
              <P muted>{t('freeCanReply')}</P>
            </>
          ) : r.status === 'pending' ? (
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Tag label={t('status_i_pending')} tone="gold" />
              <Button title={t('withdraw')} variant="ghost" onPress={() => withdraw(r)} />
            </Row>
          ) : (
            <Tag label={t(`status_i_${r.status}` as TKey)} tone={r.status === 'accepted' ? 'green' : 'grey'} />
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), gap: space(3) },
  name: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  time: { fontSize: 12, color: colors.muted },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  msg: { fontSize: 14, lineHeight: 20, color: '#3C4148', backgroundColor: colors.bg, borderRadius: radius.md, padding: space(3) },
});
